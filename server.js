const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const Database = require('./src/database');
const WhatsAppBot = require('./src/whatsappBot');

console.log('Starting Jtronik Bot Server...');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

console.log('Middleware configured');

// Initialize database
const db = new Database();
console.log('Database initialized');

// WhatsApp Bot instance
let whatsappBot = null;
let qrCodeData = null;
let connectionStatus = 'disconnected';

console.log('Variables initialized');

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
            return res.json({ success: false, message: 'Already connected' });
        }

        whatsappBot = new WhatsAppBot(db);
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

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dashboard available at http://localhost:${PORT}`);
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
