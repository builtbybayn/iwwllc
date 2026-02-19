import { fetch } from 'undici';
import dotenv from 'dotenv';
import { log } from './utils/logger.js';
import { DB } from './db.js';

dotenv.config();

/**
 * A standalone Bot Launcher script.
 * In a portfolio version, this shows how to trigger the Web App from a bot.
 */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-frontend-url.com';
const WHITELISTED_USERS = (process.env.WHITELISTED_USERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

/**
 * Escapes characters for Telegram MarkdownV2 (general text)
 */
function escapeMarkdownV2(str) {
    if (!str) return '';
    return String(str).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Escapes characters for Telegram MarkdownV2 (URL part of an inline link)
 */
function escapeLinkUrl(str) {
    if (!str) return '';
    return String(str).replace(/[)\\]/g, '\\$&');
}

/**
 * Generates a unique short ID for jobs
 */
function generateJobId() {
    return Math.random().toString(36).substring(2, 10);
}

async function sendMessage(chatId, text, replyMarkup = {}) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'MarkdownV2',
            reply_markup: replyMarkup
        })
    });
    const data = await resp.json();
    if (!data.ok) {
        console.error('[BOT] SendMessage Failed:', data.description);
        console.error('[BOT] Failed Text:', text);
    }
}

async function sendPhoto(chatId, photoUrl, caption, replyMarkup = {}) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            photo: photoUrl,
            caption: caption,
            parse_mode: 'MarkdownV2',
            reply_markup: replyMarkup
        })
    });
    const data = await resp.json();
    if (!data.ok) {
        console.error('[BOT] SendPhoto Failed:', data.description);
    }
}

const userStates = {};

async function startBot() {
    if (!TELEGRAM_BOT_TOKEN) {
        console.error('Missing TELEGRAM_BOT_TOKEN in .env');
        return;
    }

    console.log('🤖 Window Cleaning Bot is running...');
    console.log(`Whitelisted Users: ${WHITELISTED_USERS.join(', ')}`);

    let offset = 0;
    while (true) {
        try {
            const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`);
            const data = await resp.json();

            if (data.result) {
                for (const update of data.result) {
                    offset = update.update_id + 1;
                    const msg = update.message;
                    if (!msg) continue;

                    const chatId = String(msg.chat.id);
                    const text = msg.text || '';
                    const userId = String(msg.from?.id);

                    console.log(`[BOT] Received message from ${userId}: "${text}"`);

                    // Whitelist check
                    if (WHITELISTED_USERS.length > 0 && !WHITELISTED_USERS.includes(userId)) {
                        console.log(`[BOT] Unauthorized access attempt by ${userId}`);
                        await sendMessage(chatId, '❌ *Access Denied*\\. You are not authorized to use this bot\\.');
                        continue;
                    }

                    if (text === '/start') {
                        await sendMessage(chatId, `
✨ *Island Window Wizards LLC Bot* ✨
Use this to create secure payment links for customers\\.

🚀 *Quick Method*
Type \`/job [amount] [description]\`
_Example: \`/job 125 Full Exterior Cleaning\`_

💬 *Step\\-by\\-Step Method*
Just type \`/job\` and I will guide you through it\\.
                        `.trim());
                        userStates[userId] = null;
                        continue;
                    }

                    // Handle Interactive Flow States
                    if (userStates[userId]) {
                        if (userStates[userId].state === 'AWAITING_AMOUNT') {
                            const amount = parseFloat(text);
                            if (isNaN(amount)) {
                                await sendMessage(chatId, '❌ Invalid amount\\. Please enter a number \\(e\\.g\\. 125\\)\\.');
                                continue;
                            }
                            userStates[userId] = { state: 'AWAITING_DESCRIPTION', amount };
                            await sendMessage(chatId, escapeMarkdownV2('What is the description of the job?'));
                            continue;
                        }

                        if (userStates[userId].state === 'AWAITING_DESCRIPTION') {
                            const description = text;
                            const amount = userStates[userId].amount;
                            const jobId = generateJobId();

                            DB.createJob(jobId, amount, description);
                            userStates[userId] = null;

                            const payUrl = `${WEB_APP_URL}/?jobId=${jobId}`;
                            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;

                            await sendPhoto(chatId, qrUrl, `
✅ *Job Created\\!*

💰 *Amount:* $${escapeMarkdownV2(amount.toFixed(2))}
📝 *Job:* ${escapeMarkdownV2(description)}

🔗 *Payment Link:*
[${escapeMarkdownV2(payUrl)}](${escapeLinkUrl(payUrl)})
                            `.trim(), {
                                inline_keyboard: [[
                                    { text: "🔗 Open Payment Page", url: payUrl }
                                ]]
                            });
                            log('INFO', 'New job created via bot (interactive)', { jobId, amount, userId });
                            continue;
                        }
                    }

                    if (text.startsWith('/job')) {
                        const parts = text.split(' ');

                        // Single-line Flow
                        if (parts.length >= 3) {
                            const amount = parseFloat(parts[1]);
                            if (isNaN(amount)) {
                                await sendMessage(chatId, '❌ Invalid amount\\. Please enter a number\\.');
                                continue;
                            }

                            const description = parts.slice(2).join(' ');
                            const jobId = generateJobId();

                            DB.createJob(jobId, amount, description);

                            const payUrl = `${WEB_APP_URL}/?jobId=${jobId}`;
                            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;

                            await sendPhoto(chatId, qrUrl, `
✅ *Job Created\\!*

💰 *Amount:* $${escapeMarkdownV2(amount.toFixed(2))}
📝 *Job:* ${escapeMarkdownV2(description)}

🔗 *Payment Link:*
[${escapeMarkdownV2(payUrl)}](${escapeLinkUrl(payUrl)})
                            `.trim(), {
                                inline_keyboard: [[
                                    { text: "🔗 Open Payment Page", url: payUrl }
                                ]]
                            });

                            log('INFO', 'New job created via bot (single-line)', { jobId, amount, userId });
                            userStates[userId] = null;
                        }
                        // Start Interactive Flow
                        else {
                            userStates[userId] = { state: 'AWAITING_AMOUNT' };
                            await sendMessage(chatId, escapeMarkdownV2('How much is the job for? Enter a number.'));
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Polling error:', e.message);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

startBot();
