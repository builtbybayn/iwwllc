import { fetch, FormData } from 'undici';
import { log } from '../utils/logger.js';
import { DB } from '../db.js';

export class TelegramService {
    constructor(token) {
        this.token = token;
        this.enabled = !!token;
        this.offset = 0;
        this.isPolling = false;
    }

    // --- Outbound ---

    async sendPhoto(chatId, imageBuffer, caption) {
        if (!this.enabled || !chatId) return;

        try {
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('caption', caption);

            const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
            formData.append('photo', blob, 'capture.jpg');

            const resp = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
                method: 'POST',
                body: formData
            });

            if (!resp.ok) {
                const errBody = await resp.text();
                log('WARN', 'Telegram send failed', { status: resp.status, error: errBody });
            } else {
                log('INFO', 'Telegram photo sent', { chatId });
            }
        } catch (err) {
            log('ERROR', 'Telegram service error', { err: err.message });
        }
    }

    async sendMessage(chatId, text, parseMode = undefined) {
        if (!this.enabled || !chatId) return;

        try {
            const body = { chat_id: chatId, text: text };
            if (parseMode) body.parse_mode = parseMode;

            const resp = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!resp.ok) {
                const errBody = await resp.text();
                log('ERROR', 'Telegram sendMessage failed', { status: resp.status, error: errBody });
            }
        } catch (err) {
            log('ERROR', 'Telegram sendMessage network error', { err: err.message });
        }
    }

    // --- Inbound (Webhook) ---

    async processWebhookUpdate(update) {
        if (!this.enabled || !update) return;
        await this.handleUpdate(update);
    }

    async handleUpdate(update) {
        const msg = update.message;
        if (!msg || !msg.text) return;

        const text = msg.text.trim();
        const chatId = msg.chat.id;
        const firstName = msg.from?.first_name || 'Unknown';

        // Log the user if they are new
        if (!DB.getChat(chatId)) {
            log('INFO', 'New Telegram user joined', { chatId, firstName });
            DB.addChat(chatId, firstName);
        }

        if (text === '/start') {
            const responseText = `
🚀 Welcome to the *Payment Web App*\\! 🚀

Click the button below to launch the store and complete your purchase securely\\.
`.trim();

            const replyMarkup = {
                inline_keyboard: [[
                    { text: "🛒 Open Web App", web_app: { url: process.env.WEB_APP_URL || '' } }
                ]]
            };

            log('INFO', 'Received /start via Webhook', { chatId });
            await this.sendMessageWithMarkup(chatId, responseText, 'MarkdownV2', replyMarkup);
        }
    }

    async sendMessageWithMarkup(chatId, text, parseMode, replyMarkup) {
        if (!this.enabled || !chatId) return;
        try {
            const body = { 
                chat_id: chatId, 
                text: text,
                parse_mode: parseMode,
                reply_markup: replyMarkup
            };
            await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (err) {
            log('ERROR', 'Telegram sendMessageWithMarkup failed', { err: err.message });
        }
    }
}
