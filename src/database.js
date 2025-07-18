const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, '..', 'database', 'whatsapp_bot.db');
        this.db = null;
        this.init();
    }

    init() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('Connected to SQLite database');
                this.createTables();
            }
        });
    }

    createTables() {
        const createContactsTable = `
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone_number TEXT UNIQUE NOT NULL,
                name TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createMessagesTable = `
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone_number TEXT NOT NULL,
                message_text TEXT NOT NULL,
                message_type TEXT DEFAULT 'text',
                direction TEXT NOT NULL, -- 'incoming' or 'outgoing'
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                message_id TEXT,
                status TEXT DEFAULT 'sent'
            )
        `;

        const createSettingsTable = `
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_name TEXT UNIQUE NOT NULL,
                key_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createTransactionsTable = `
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kode_produk TEXT NOT NULL,
                tujuan TEXT NOT NULL,
                nominal TEXT NOT NULL,
                pin TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                sent_to TEXT,
                sent_at DATETIME,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        this.db.serialize(() => {
            this.db.run(createContactsTable);
            this.db.run(createMessagesTable);
            this.db.run(createSettingsTable);
            this.db.run(createTransactionsTable);
        });
    }

    // Contact methods
    async addContact(phoneNumber, name = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO contacts (phone_number, name, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);
            
            stmt.run([phoneNumber, name], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            
            stmt.finalize();
        });
    }

    async getContacts() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM contacts 
                ORDER BY updated_at DESC
            `, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getContact(phoneNumber) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT * FROM contacts 
                WHERE phone_number = ?
            `, [phoneNumber], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Message methods
    async addMessage(phoneNumber, messageText, direction, messageId = null, messageType = 'text') {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO messages (phone_number, message_text, message_type, direction, message_id)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            stmt.run([phoneNumber, messageText, messageType, direction, messageId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            
            stmt.finalize();
        });
    }

    async getMessages(limit = 100) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT m.*, c.name as contact_name 
                FROM messages m
                LEFT JOIN contacts c ON m.phone_number = c.phone_number
                ORDER BY m.timestamp DESC
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getMessagesByContact(phoneNumber, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM messages 
                WHERE phone_number = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `, [phoneNumber, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Settings methods
    async setSetting(key, value) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO settings (key_name, key_value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `);
            
            stmt.run([key, value], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            
            stmt.finalize();
        });
    }

    async getSetting(key) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT key_value FROM settings 
                WHERE key_name = ?
            `, [key], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.key_value : null);
                }
            });
        });
    }

    // Transaction methods
    async addTransaction(kodeProduk, tujuan, nominal, pin) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO transactions (kode_produk, tujuan, nominal, pin)
                VALUES (?, ?, ?, ?)
            `);
            
            stmt.run([kodeProduk, tujuan, nominal, pin], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            
            stmt.finalize();
        });
    }

    async addTransactions(transactions) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO transactions (kode_produk, tujuan, nominal, pin)
                VALUES (?, ?, ?, ?)
            `);
            
            const db = this.db; // Store reference to db
            
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                
                let completed = 0;
                const total = transactions.length;
                let hasError = false;
                
                if (total === 0) {
                    db.run("COMMIT");
                    stmt.finalize();
                    resolve(0);
                    return;
                }
                
                transactions.forEach((transaction) => {
                    stmt.run([
                        transaction.kodeProduk,
                        transaction.tujuan,
                        transaction.nominal,
                        transaction.pin
                    ], function(err) {
                        if (err && !hasError) {
                            hasError = true;
                            db.run("ROLLBACK");
                            stmt.finalize();
                            reject(err);
                            return;
                        }
                        
                        completed++;
                        if (completed === total && !hasError) {
                            db.run("COMMIT");
                            stmt.finalize();
                            resolve(completed);
                        }
                    });
                });
            });
        });
    }

    async getAllTransactions() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM transactions 
                ORDER BY created_at DESC
            `, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getTransaction(id) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT * FROM transactions WHERE id = ?
            `, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async updateTransactionStatus(id, status, sentTo = null, errorMessage = null) {
        return new Promise((resolve, reject) => {
            const sentAt = status === 'sent' ? new Date().toISOString() : null;
            
            const stmt = this.db.prepare(`
                UPDATE transactions 
                SET status = ?, sent_to = ?, sent_at = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            
            stmt.run([status, sentTo, sentAt, errorMessage, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
            
            stmt.finalize();
        });
    }

    async deleteTransaction(id) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`DELETE FROM transactions WHERE id = ?`);
            
            stmt.run([id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
            
            stmt.finalize();
        });
    }

    async clearAllTransactions() {
        return new Promise((resolve, reject) => {
            this.db.run(`DELETE FROM transactions`, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async resetTransactionStatuses() {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE transactions 
                SET status = 'pending', sent_to = NULL, sent_at = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
            `, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

module.exports = Database;
