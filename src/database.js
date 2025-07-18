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
        // Only keep transactions table - remove unused contacts, messages, settings tables
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

        this.db.run(createTransactionsTable);
    }

    // Transaction methods - keep only these methods
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

    async updateTransaction(id, kodeProduk, tujuan, nominal, pin) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                UPDATE transactions 
                SET kode_produk = ?, tujuan = ?, nominal = ?, pin = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            
            stmt.run([kodeProduk, tujuan, nominal, pin, id], function(err) {
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

// Create and export database instance
const database = new Database();
module.exports = database;
