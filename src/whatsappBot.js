const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const EventEmitter = require('events');

class WhatsAppBot extends EventEmitter {
    constructor(database) {
        super();
        this.db = database;
        this.sock = null;
        this.authState = null;
        this.saveCreds = null;
        // Handle path for executable
        const isDev = process.env.NODE_ENV !== 'production' && !process.pkg;
        const basePath = isDev ? __dirname : path.dirname(process.execPath);
        this.sessionPath = path.join(basePath, 'sessions');
        this.isInitializing = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        
        // Ensure session directory exists
        this.ensureSessionDirectory();
    }

    async initialize() {
        try {
            if (this.isInitializing) {
                console.log('Already initializing, skipping...');
                return;
            }
            
            this.isInitializing = true;
            console.log('Initializing WhatsApp Bot...');

            // Get auth state
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
            this.authState = state;
            this.saveCreds = saveCreds;

            // Get latest Baileys version
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

            // Create socket
            this.sock = makeWASocket({
                version,
                auth: this.authState,
                printQRInTerminal: false,
                browser: ['Jtronik Bot', 'Chrome', '1.0.0'],
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: true,
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                patchMessageBeforeSending: (message) => {
                    const requiresPatch = !!(
                        message.buttonsMessage || 
                        message.templateMessage || 
                        message.listMessage
                    );
                    if (requiresPatch) {
                        message = {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadataVersion: 2,
                                        deviceListMetadata: {},
                                    },
                                    ...message,
                                }
                            }
                        };
                    }
                    return message;
                }
            });

            // Setup event handlers
            this.setupEventHandlers();
            
            this.isInitializing = false;
            return this.sock;
        } catch (error) {
            console.error('Error initializing WhatsApp bot:', error);
            this.isInitializing = false;
            throw error;
        }
    }

    setupEventHandlers() {
        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('QR Code received');
                this.emit('qr', qr);
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                const isAuthError = (lastDisconnect?.error)?.output?.statusCode === 401;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                
                console.log('Connection closed due to:', lastDisconnect?.error?.message || 'Unknown reason');
                console.log('Status code:', statusCode);
                console.log('Should reconnect:', shouldReconnect);
                
                if (isAuthError || statusCode === 401) {
                    console.log('Authentication error detected. Session may be expired.');
                    this.connectionAttempts++;
                    
                    if (this.connectionAttempts >= this.maxConnectionAttempts) {
                        console.log('Max connection attempts reached. Clearing session...');
                        this.clearSession();
                        this.connectionAttempts = 0;
                        this.emit('disconnected');
                    } else {
                        console.log(`Attempting to reconnect (${this.connectionAttempts}/${this.maxConnectionAttempts})...`);
                        setTimeout(() => {
                            this.initialize();
                        }, 5000);
                    }
                } else if (shouldReconnect) {
                    console.log('Attempting to reconnect...');
                    setTimeout(() => {
                        this.initialize();
                    }, 5000);
                } else {
                    this.emit('disconnected');
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connection opened successfully');
                this.connectionAttempts = 0; // Reset counter on successful connection
                this.emit('ready');
            } else if (connection === 'connecting') {
                console.log('Connecting to WhatsApp...');
            }
        });

        this.sock.ev.on('creds.update', this.saveCreds);

        this.sock.ev.on('messages.upsert', async (m) => {
            // Incoming message handling removed - not used in current implementation
            // Can be re-enabled if message logging is needed in the future
            const message = m.messages[0];
            if (!message.key.fromMe && m.type === 'notify') {
                console.log(`Received message from ${message.key.remoteJid}`);
            }
        });

        // Contact updates handling removed - not used in current implementation
        this.sock.ev.on('contacts.update', async (contacts) => {
            // Contact logging disabled - can be re-enabled if contact management is needed
            console.log(`${contacts.length} contacts updated`);
        });

        // Handle connection errors
        this.sock.ev.on('connection.error', (error) => {
            console.error('Connection error:', error);
        });
    }

    async handleIncomingMessage(message) {
        // Simplified incoming message handler - contact/message logging removed
        try {
            const phoneNumber = message.key.remoteJid.replace('@s.whatsapp.net', '');
            const messageText = message.message?.conversation || 
                              message.message?.extendedTextMessage?.text || 
                              'Media message';

            console.log(`Message from ${phoneNumber}: ${messageText}`);

            // Auto-reply logic can be added here if needed
            // await this.sendMessage(phoneNumber, 'Auto reply: Message received');

        } catch (error) {
            console.error('Error handling incoming message:', error);
        }
    }

    async sendMessage(phoneNumber, messageText) {
        try {
            if (!this.sock) {
                throw new Error('WhatsApp socket not initialized');
            }

            const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
            
            const messageInfo = await this.sock.sendMessage(jid, { text: messageText });

            console.log(`Message sent to ${phoneNumber}: ${messageText}`);
            return messageInfo;

        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.sock) {
                await this.sock.logout();
                this.sock = null;
            }
            console.log('WhatsApp bot disconnected');
        } catch (error) {
            console.error('Error disconnecting:', error);
            throw error;
        }
    }

    async clearSession() {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            console.log('Clearing session files...');
            
            // Close existing connection
            if (this.sock) {
                try {
                    await this.sock.logout();
                } catch (error) {
                    console.log('Error during logout:', error.message);
                }
                this.sock = null;
            }
            
            // Clear session files
            try {
                const files = await fs.readdir(this.sessionPath);
                for (const file of files) {
                    await fs.unlink(path.join(this.sessionPath, file));
                }
                console.log('Session files cleared successfully');
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.log('Error clearing session files:', error.message);
                }
            }
            
            // Reset auth state
            this.authState = null;
            this.connectionAttempts = 0;
            
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    }

    ensureSessionDirectory() {
        try {
            const fs = require('fs');
            if (!fs.existsSync(this.sessionPath)) {
                fs.mkdirSync(this.sessionPath, { recursive: true });
                console.log('Session directory created:', this.sessionPath);
            }
        } catch (error) {
            console.error('Error creating session directory:', error);
        }
    }

    async forceReconnect() {
        try {
            console.log('Force reconnecting...');
            this.connectionAttempts = 0;
            
            // Close current connection
            if (this.sock) {
                try {
                    await this.sock.end();
                } catch (error) {
                    console.log('Error ending socket:', error.message);
                }
                this.sock = null;
            }
            
            // Reinitialize
            await this.initialize();
        } catch (error) {
            console.error('Error in force reconnect:', error);
            this.emit('disconnected');
        }
    }

    isConnected() {
        return this.sock && this.sock.ws && this.sock.ws.readyState === 1;
    }

    async disconnect() {
        try {
            console.log('Disconnecting WhatsApp bot...');
            this.connectionAttempts = 0;
            
            if (this.sock) {
                await this.sock.logout();
                this.sock = null;
            }
            console.log('WhatsApp bot disconnected');
        } catch (error) {
            console.error('Error disconnecting:', error);
            throw error;
        }
    }
}

module.exports = WhatsAppBot;
