import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'payments.db');
console.log('DEBUG: Connecting to DB at:', DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Initialize Tables
db.exec(`
    CREATE TABLE IF NOT EXISTS allowed_chats (
        chat_id TEXT PRIMARY KEY,
        name TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        external_id TEXT,
        status TEXT DEFAULT 'unpaid',
        amount REAL,
        tip_amount REAL DEFAULT 0,
        currency TEXT,
        pay_amount REAL,
        pay_address TEXT,
        pay_currency TEXT,
        network_name TEXT,
        qrcode TEXT,
        expired_at INTEGER,
        email TEXT,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        amount REAL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Migration: Add columns if they don't exist
const migrations = [
    "ALTER TABLE orders ADD COLUMN qrcode TEXT;",
    "ALTER TABLE orders ADD COLUMN network_name TEXT;",
    "ALTER TABLE orders ADD COLUMN expired_at INTEGER;"
];

migrations.forEach(sql => {
    try {
        db.exec(sql);
    } catch (err) {
        // Ignore "duplicate column name" errors
    }
});

export const DB = {
    // --- Jobs ---
    createJob: (id, amount, description) => {
        db.prepare('INSERT INTO jobs (id, amount, description) VALUES (?, ?, ?)')
            .run(id, amount, description);
        return id;
    },

    getJob: (jobId) => {
        return db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    },

    updateJobStatus: (jobId, status) => {
        db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(status, jobId);
    },

    // --- Orders ---
    createOrder: (orderData) => {
        const { id, jobId, amount, tipAmount, currency, email, phone } = orderData;
        db.prepare(`
            INSERT INTO orders (id, job_id, amount, tip_amount, currency, email, phone) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, jobId, amount, tipAmount, currency, email, phone);
        return id;
    },

    updateOrderPayment: (orderId, paymentData) => {
        const { externalId, payAmount, payAddress, payCurrency, qrcode, networkName, expiredAt } = paymentData;
        db.prepare(`
            UPDATE orders 
            SET external_id = ?, pay_amount = ?, pay_address = ?, pay_currency = ?, qrcode = ?, network_name = ?, expired_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(externalId, payAmount, payAddress, payCurrency, qrcode, networkName, expiredAt, orderId);
    },

    updateOrderStatus: (id, status, isExternal = false) => {
        const idColumn = isExternal ? 'external_id' : 'id';
        // Find order to update job status as well
        const order = db.prepare(`SELECT job_id FROM orders WHERE ${idColumn} = ?`).get(id);
        
        db.prepare(`
            UPDATE orders 
            SET status = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE ${idColumn} = ?
        `).run(status, id);

        if (order && order.job_id && (status === 'paid' || status === 'confirmed')) {
            db.prepare('UPDATE jobs SET status = "paid" WHERE id = ?').run(order.job_id);
        }
    },

    getOrder: (orderId) => {
        return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    },

    // --- Telegram Chats ---
    getChat: (chatId) => {
        return db.prepare('SELECT * FROM allowed_chats WHERE chat_id = ?').get(String(chatId));
    },

    addChat: (chatId, name, role = 'user') => {
        try {
            db.prepare('INSERT INTO allowed_chats (chat_id, name, role) VALUES (?, ?, ?)').run(String(chatId), name, role);
            return true;
        } catch (err) {
            return false;
        }
    },

    removeChat: (chatId) => {
        db.prepare('DELETE FROM allowed_chats WHERE chat_id = ?').run(String(chatId));
    },
    
    getAllChats: () => {
        return db.prepare('SELECT * FROM allowed_chats').all();
    }
};
