const axios = require('axios');
const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./src/database');
const WhatsAppBot = require('./src/whatsappBot');
const { exec } = require('child_process');
const { client, xml } = require('@xmpp/client');
const tls = require('tls');

// Handle path for executable
const isDev = process.env.NODE_ENV !== 'production' && !process.pkg;
const basePath = isDev ? __dirname : path.dirname(process.execPath);

console.log('Starting Jtronik Bot Server...');
console.log('Base path:', basePath);
console.log('Is development:', isDev);

// Set global TLS options to ignore certificate errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Override the default TLS connect behavior to ignore certificate errors
const originalConnect = tls.connect;
tls.connect = function(options, callback) {
    if (typeof options === 'object') {
        options.rejectUnauthorized = false;
        options.checkServerIdentity = function() {
            return undefined; // Don't reject any certificate
        };
    }
    return originalConnect.call(this, options, callback);
};

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(basePath, 'public')));

console.log('Middleware configured');

// Database is already initialized via require
console.log('Database initialized');

// WhatsApp Bot instance
let whatsappBot = null;
let qrCodeData = null;
let connectionStatus = 'disconnected';

// Jabber/XMPP client instance
let jabberClient = null;
let jabberConnectionStatus = 'disconnected';
let jabberConfig = {
    server: '',
    port: 5222,
    username: '',
    password: '',
    targetJID: ''
};

// Function to save Jabber configuration to file
function saveJabberConfig() {
    try {
        const fs = require('fs');
        const configPath = path.join(basePath, 'jabber-config.json');
        const configToSave = {
            server: jabberConfig.server,
            port: jabberConfig.port,
            username: jabberConfig.username,
            password: jabberConfig.password, // Note: In production, encrypt this
            targetJID: jabberConfig.targetJID
        };
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
        console.log('Jabber configuration saved');
    } catch (error) {
        console.error('Error saving Jabber config:', error);
    }
}

// Function to clear Jabber configuration file
function clearJabberConfig() {
    try {
        const fs = require('fs');
        const configPath = path.join(basePath, 'jabber-config.json');
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
            console.log('Jabber configuration file deleted');
        }
        // Reset in-memory config
        jabberConfig = {
            server: '',
            port: 5222,
            username: '',
            password: '',
            targetJID: ''
        };
    } catch (error) {
        console.error('Error clearing Jabber config:', error);
    }
}

// Function to load Jabber configuration from file
function loadJabberConfig() {
    try {
        const fs = require('fs');
        const configPath = path.join(basePath, 'jabber-config.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const savedConfig = JSON.parse(configData);
            jabberConfig = { ...jabberConfig, ...savedConfig };
            console.log('Jabber configuration loaded:', {
                server: jabberConfig.server,
                port: jabberConfig.port,
                username: jabberConfig.username,
                targetJID: jabberConfig.targetJID
            });
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error loading Jabber config:', error);
        return false;
    }
}

// Function to auto-reconnect Jabber
async function autoReconnectJabber() {
    try {
        // Load saved configuration
        const hasConfig = loadJabberConfig();
        
        if (!hasConfig || !jabberConfig.server || !jabberConfig.username || !jabberConfig.password) {
            console.log('No valid Jabber configuration found, manual connection required');
            return;
        }

        console.log('Found Jabber configuration, attempting auto-reconnect...');
        jabberConnectionStatus = 'connecting';

        // Create XMPP client with saved config
        const clientConfig = {
            service: `xmpp://${jabberConfig.server}:${jabberConfig.port}`,
            domain: jabberConfig.server,
            username: jabberConfig.username.split('@')[0],
            password: jabberConfig.password,
            tls: false
        };

        jabberClient = client(clientConfig);

        console.log('Attempting Jabber auto-reconnect with config:', {
            server: jabberConfig.server,
            port: jabberConfig.port,
            username: jabberConfig.username.split('@')[0],
            domain: jabberConfig.server,
            tls: false
        });

        // Set up event listeners
        jabberClient.on('error', (err) => {
            console.error('Jabber auto-reconnect error:', err);
            jabberConnectionStatus = 'disconnected';
        });

        jabberClient.on('offline', () => {
            console.log('Jabber client offline during auto-reconnect');
            jabberConnectionStatus = 'disconnected';
        });

        jabberClient.on('online', (address) => {
            console.log('Jabber auto-reconnected successfully:', address.toString());
            jabberConnectionStatus = 'connected';
        });

        jabberClient.on('stanza', (stanza) => {
            console.log('Received stanza during auto-reconnect:', stanza.toString());
        });

        // Start connection
        await jabberClient.start();

        // Add timeout for auto-reconnect attempt
        setTimeout(() => {
            if (jabberConnectionStatus === 'connecting') {
                console.log('Jabber auto-reconnect timeout');
                jabberConnectionStatus = 'disconnected';
            }
        }, 10000); // 10 seconds timeout

    } catch (error) {
        console.error('Error during Jabber auto-reconnect:', error);
        jabberConnectionStatus = 'disconnected';
    }
}

// Function to open browser
function openBrowser(url) {
    const start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
    exec(`${start} ${url}`, (error) => {
        if (error) {
            console.log('Could not open browser automatically. Please open manually:', url);
        } else {
            console.log('Browser opened automatically');
        }
    });
}

console.log('Variables initialized');

// Function to check and auto-reconnect WhatsApp
async function autoReconnectWhatsApp() {
    try {
        const fs = require('fs');
        const path = require('path');
        const sessionsDir = path.join(basePath, 'sessions');
        
        // Check if sessions directory exists and has session files
        if (fs.existsSync(sessionsDir)) {
            const files = fs.readdirSync(sessionsDir);
            const hasSessionFiles = files.some(file => 
                file.includes('creds.json') || 
                file.includes('session-') || 
                file.includes('app-state-sync')
            );
            
            if (hasSessionFiles) {
                console.log('Found existing session files, attempting auto-reconnect...');
                
                // Set initial status to connecting
                connectionStatus = 'connecting';
                
                whatsappBot = new WhatsAppBot(db);
                await whatsappBot.initialize();

                whatsappBot.on('qr', async (qr) => {
                    try {
                        console.log('QR code received during auto-reconnect - session expired, new QR required');
                        qrCodeData = await QRCode.toDataURL(qr, {
                            width: 256,
                            margin: 2,
                            color: {
                                dark: '#000000',
                                light: '#FFFFFF'
                            }
                        });
                        console.log('QR Code generated for web display');
                        // Reset to disconnected so user can see QR code
                        connectionStatus = 'disconnected';
                    } catch (error) {
                        console.error('Error generating QR code:', error);
                        qrCodeData = qr;
                        connectionStatus = 'disconnected';
                    }
                });

                whatsappBot.on('ready', () => {
                    connectionStatus = 'connected';
                    qrCodeData = null;
                    console.log('WhatsApp bot auto-reconnected successfully!');
                });

                whatsappBot.on('disconnected', () => {
                    connectionStatus = 'disconnected';
                    qrCodeData = null;
                    console.log('WhatsApp bot disconnected during auto-reconnect');
                });
                
                // Add timeout for auto-reconnect attempt
                setTimeout(() => {
                    if (connectionStatus === 'connecting') {
                        console.log('Auto-reconnect timeout, session may be expired');
                        connectionStatus = 'disconnected';
                    }
                }, 10000); // 10 seconds timeout
                
            } else {
                console.log('No valid session files found, manual connection required');
            }
        } else {
            console.log('Sessions directory not found, manual connection required');
        }
    } catch (error) {
        console.error('Error during auto-reconnect:', error);
        connectionStatus = 'disconnected';
        qrCodeData = null;
    }
}

// Auto-reconnect on startup
autoReconnectWhatsApp();
autoReconnectJabber();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(basePath, 'public', 'index.html'));
});

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        status: connectionStatus,
        qrCode: qrCodeData
    });
});

app.post('/api/connect', async (req, res) => {
    try {
        console.log('Connect request received');
        
        if (whatsappBot && connectionStatus === 'connected') {
            return res.json({ success: true, message: 'Already connected' });
        }
        
        if (whatsappBot && connectionStatus === 'connecting') {
            return res.json({ success: true, message: 'Connection in progress' });
        }

        whatsappBot = new WhatsAppBot(db);
        connectionStatus = 'connecting';
        await whatsappBot.initialize();

        whatsappBot.on('qr', async (qr) => {
            try {
                console.log('QR code received, generating data URL...');
                qrCodeData = await QRCode.toDataURL(qr, {
                    width: 256,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                console.log('QR Code generated for web display');
            } catch (error) {
                console.error('Error generating QR code:', error);
                qrCodeData = qr; // fallback to raw QR string
            }
        });

        whatsappBot.on('ready', () => {
            connectionStatus = 'connected';
            qrCodeData = null;
            console.log('WhatsApp bot is ready!');
        });

        whatsappBot.on('disconnected', () => {
            connectionStatus = 'disconnected';
            qrCodeData = null;
            console.log('WhatsApp bot disconnected');
        });

        res.json({ success: true, message: 'Connection initiated' });
    } catch (error) {
        console.error('Error connecting to WhatsApp:', error);
        connectionStatus = 'disconnected';
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/disconnect', async (req, res) => {
    try {
        console.log('Disconnect request received');
        
        if (whatsappBot) {
            await whatsappBot.disconnect();
            whatsappBot = null;
        }
        connectionStatus = 'disconnected';
        qrCodeData = null;
        res.json({ success: true, message: 'Disconnected successfully' });
    } catch (error) {
        console.error('Error disconnecting:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/clear-session', async (req, res) => {
    try {
        console.log('Clear session request received');
        
        if (whatsappBot) {
            await whatsappBot.clearSession();
            whatsappBot = null;
        }
        connectionStatus = 'disconnected';
        qrCodeData = null;
        res.json({ success: true, message: 'Session cleared successfully' });
    } catch (error) {
        console.error('Error clearing session:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/send-message', async (req, res) => {
    try {
        console.log('Send message request:', req.body);
        
        const { number, message } = req.body;
        
        if (!number || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'Number and message are required' 
            });
        }
        
        if (!whatsappBot || connectionStatus !== 'connected') {
            return res.status(400).json({ 
                success: false, 
                message: 'Bot not connected' 
            });
        }

        // Format nomor WhatsApp dengan benar
        let formattedNumber = number.toString().replace(/\D/g, '');
        
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.slice(1);
        } else if (!formattedNumber.startsWith('62')) {
            formattedNumber = '62' + formattedNumber;
        }
        
        const jid = formattedNumber + '@s.whatsapp.net';
        
        console.log(`Sending message to ${jid}: ${message}`);
        
        await whatsappBot.sendMessage(jid, message);
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to send message' 
        });
    }
});

// Transaction API endpoints
app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await db.getAllTransactions();
        res.json({ success: true, data: transactions });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { transactions } = req.body;
        
        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, message: 'Transactions array is required' });
        }

        await db.clearAllTransactions();
        await db.addTransactions(transactions);
        
        res.json({ success: true, message: `${transactions.length} transactions saved successfully` });
    } catch (error) {
        console.error('Error saving transactions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/transactions/add', async (req, res) => {
    try {
        const { transactions } = req.body;
        
        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, message: 'Transactions array is required' });
        }

        await db.addTransactions(transactions);
        
        res.json({ success: true, message: `${transactions.length} transactions added successfully` });
    } catch (error) {
        console.error('Error adding transactions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/transactions/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, sentTo, errorMessage } = req.body;
        
        await db.updateTransactionStatus(id, status, sentTo, errorMessage);
        
        res.json({ success: true, message: 'Transaction status updated' });
    } catch (error) {
        console.error('Error updating transaction status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { kodeProduk, tujuan, nominal, pin } = req.body;
        
        await db.updateTransaction(id, kodeProduk, tujuan, nominal, pin);
        
        res.json({ success: true, message: 'Transaction updated successfully' });
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await db.deleteTransaction(id);
        
        res.json({ success: true, message: 'Transaction deleted successfully' });
    } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/transactions', async (req, res) => {
    try {
        await db.clearAllTransactions();
        res.json({ success: true, message: 'All transactions cleared' });
    } catch (error) {
        console.error('Error clearing transactions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/transactions/reset-status', async (req, res) => {
    try {
        await db.resetTransactionStatuses();
        res.json({ success: true, message: 'All transaction statuses reset' });
    } catch (error) {
        console.error('Error resetting transaction statuses:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Jabber/XMPP API endpoints
app.get('/api/jabber/status', (req, res) => {
    res.json({
        status: jabberConnectionStatus,
        config: {
            server: jabberConfig.server,
            port: jabberConfig.port,
            username: jabberConfig.username,
            targetJID: jabberConfig.targetJID
        }
    });
});

app.post('/api/jabber/connect', async (req, res) => {
    try {
        const { server, port, username, password, targetJID, ignoreSSL } = req.body;
        
        if (!server || !username || !password) {
            return res.status(400).json({ success: false, message: 'Server, username, and password are required' });
        }
        
        // Update configuration
        jabberConfig = {
            server,
            port: port || 5222,
            username,
            password,
            targetJID: targetJID || ''
        };
        
        // Disconnect existing connection if any
        if (jabberClient) {
            try {
                await jabberClient.stop();
            } catch (error) {
                console.log('Error stopping existing jabber client:', error.message);
            }
        }
        
        // Create new XMPP client with comprehensive SSL bypass
        const jid = username.includes('@') ? username : `${username}@${server}`;
        const clientConfig = {
            service: `xmpp://${server}:${port}`,
            domain: server,
            username: username.split('@')[0],
            password: password,
            // Force non-encrypted connection first
            tls: false
        };
        
        jabberClient = client(clientConfig);
        
        jabberConnectionStatus = 'connecting';
        
        console.log('Attempting Jabber connection with config:', {
            server,
            port,
            username: username.split('@')[0],
            domain: server,
            tls: false
        });
        
        // Set up event listeners
        jabberClient.on('error', (err) => {
            console.error('Jabber connection error:', err);
            jabberConnectionStatus = 'disconnected';
        });
        
        jabberClient.on('offline', () => {
            console.log('Jabber client offline');
            jabberConnectionStatus = 'disconnected';
        });
        
        jabberClient.on('online', (address) => {
            console.log('Jabber client online:', address.toString());
            jabberConnectionStatus = 'connected';
            // Save configuration when successfully connected
            saveJabberConfig();
        });
        
        jabberClient.on('stanza', (stanza) => {
            console.log('Received stanza:', stanza.toString());
        });
        
        // Start connection
        await jabberClient.start();
        
        res.json({ success: true, message: 'Jabber connection initiated' });
    } catch (error) {
        console.error('Error connecting to Jabber:', error);
        jabberConnectionStatus = 'disconnected';
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/jabber/disconnect', async (req, res) => {
    try {
        if (jabberClient) {
            await jabberClient.stop();
            jabberClient = null;
        }
        jabberConnectionStatus = 'disconnected';
        
        // Optionally clear saved config (uncomment if you want to clear config on disconnect)
        // clearJabberConfig();
        
        res.json({ success: true, message: 'Jabber disconnected successfully' });
    } catch (error) {
        console.error('Error disconnecting from Jabber:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/jabber/clear-config', async (req, res) => {
    try {
        if (jabberClient) {
            await jabberClient.stop();
            jabberClient = null;
        }
        jabberConnectionStatus = 'disconnected';
        
        // Clear saved configuration
        clearJabberConfig();
        
        res.json({ success: true, message: 'Jabber configuration cleared successfully' });
    } catch (error) {
        console.error('Error clearing Jabber config:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/jabber/test', async (req, res) => {
    try {
        if (!jabberClient || jabberConnectionStatus !== 'connected') {
            return res.status(400).json({ success: false, message: 'Jabber not connected' });
        }
        
        const targetJID = req.body.targetJID || jabberConfig.targetJID;
        if (!targetJID) {
            return res.status(400).json({ success: false, message: 'Target JID is required' });
        }
        
        const testMessage = xml(
            'message',
            { type: 'chat', to: targetJID },
            xml('body', {}, 'Test message from Jtronik Bot - Connection successful!')
        );
        
        await jabberClient.send(testMessage);
        res.json({ success: true, message: `Test message sent to ${targetJID}` });
    } catch (error) {
        console.error('Error sending test message:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/jabber/send-transaction', async (req, res) => {
    try {
        if (!jabberClient || jabberConnectionStatus !== 'connected') {
            return res.status(400).json({ success: false, message: 'Jabber not connected' });
        }
        
        const { targetJID, transactionData } = req.body;
        const jid = targetJID || jabberConfig.targetJID;
        
        if (!jid) {
            return res.status(400).json({ success: false, message: 'Target JID is required' });
        }
        
        if (!transactionData) {
            return res.status(400).json({ success: false, message: 'Transaction data is required' });
        }
        
        const message = xml(
            'message',
            { type: 'chat', to: jid },
            xml('body', {}, `Transaction: ${transactionData}`)
        );
        
        await jabberClient.send(message);
        res.json({ success: true, message: `Transaction sent to ${jid}` });
    } catch (error) {
        console.error('Error sending transaction via Jabber:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dashboard available at http://localhost:${PORT}`);
    
    // Open browser automatically after 2 seconds delay
    setTimeout(() => {
        openBrowser(`http://localhost:${PORT}`);
    }, 2000);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    if (whatsappBot) {
        await whatsappBot.disconnect();
    }
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Server setup complete, starting...');
