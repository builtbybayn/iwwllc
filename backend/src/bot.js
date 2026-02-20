import { fetch } from 'undici';
import dotenv from 'dotenv';
import { log } from './utils/logger.js';
import { DB } from './db.js';
import { GoogleService } from './services/google.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * A standalone Bot Launcher script.
 */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-frontend-url.com';
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

console.log('DEBUG: Google IDs loaded:', { 
    sheet: GOOGLE_SHEET_ID ? 'YES' : 'NO', 
    calendar: GOOGLE_CALENDAR_ID ? 'YES' : 'NO' 
});

const WHITELISTED_USERS = (process.env.WHITELISTED_USERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

const googleService = new GoogleService();
const userStates = {};

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

/**
 * Basic Date/Time parser helper
 * Returns a simple ISO string for today + user time if possible
 */
function parseToISO(dateStr, timeStr) {
    try {
        const year = new Date().getFullYear();
        const fullStr = `${dateStr} ${year} ${timeStr}`;
        const date = new Date(fullStr);
        if (isNaN(date.getTime())) return null;
        return date.toISOString();
    } catch {
        return null;
    }
}

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

                    // --- CANCEL COMMAND ---
                    if (text === '/cancel') {
                        if (userStates[userId]) {
                            const state = userStates[userId].state;
                            let cmdName = 'interactive';
                            if (state.includes('LEAD')) cmdName = 'lead';
                            else if (state.includes('BOOK')) cmdName = 'booking';
                            else if (state.includes('AMOUNT') || state.includes('DESCRIPTION')) cmdName = 'invoice';
                            
                            userStates[userId] = null;
                            await sendMessage(chatId, `✅ Cancelled ${cmdName} command\\.`);
                        } else {
                            await sendMessage(chatId, 'ℹ️ No active command to cancel\\.');
                        }
                        continue;
                    }

                    // Whitelist check
                    if (WHITELISTED_USERS.length > 0 && !WHITELISTED_USERS.includes(userId)) {
                        console.log(`[BOT] Unauthorized access attempt by ${userId}`);
                        await sendMessage(chatId, '❌ *Access Denied*\\. You are not authorized to use this bot\\.');
                        continue;
                    }

                    if (text === '/start') {
                        await sendMessage(chatId, `
⚡ *Island Window Wizards LLC* ⚡

💰 \`/invoice\` \\- Create payment link
📊 \`/lead\` \\- Add customer lead
📅 \`/book\` \\- Schedule booking
🛠 \`/cancel\` \\- Stop current flow

_Type \`/help\` for advanced usage_
                        `.trim());
                        userStates[userId] = null;
                        continue;
                    }

                    if (text === '/help') {
                        await sendMessage(chatId, `
🛠 *Advanced Command Usage*

💰 *Invoices*
\`/invoice [amount] [description]\`
_Ex: \`/invoice 125 Exterior Cleaning\`_

📊 *Leads*
\`/lead [name] [phone] [description]\`
_Ex: \`/lead John 555-0199 New House\`_

📅 *Bookings*
\`/book [name], [date], [time], [price], [desc]\`
_Ex: \`/book John, Oct 12, 10am, 150, Full\`_

⚡ *Tip:* Type any command without arguments to use the interactive guide\\.
                        `.trim());
                        userStates[userId] = null;
                        continue;
                    }

                    // --- COMMAND TRIGGERS ---

                    if (text.startsWith('/lead')) {
                        const parts = text.split(' ');
                        if (parts.length >= 4) {
                            const name = parts[1];
                            const phone = parts[2];
                            const description = parts.slice(3).join(' ');
                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Leads', [name, phone, description, new Date().toLocaleDateString()]);
                                await sendMessage(chatId, `
✅ *Lead Saved\\!*
👤 *Name:* ${escapeMarkdownV2(name)}
📞 *Phone:* ${escapeMarkdownV2(phone)}
📝 *Desc:* ${escapeMarkdownV2(description)}
                                `.trim());
                            } catch (err) { await sendMessage(chatId, '❌ Failed to add lead\\. Check server console\\.'); }
                        } else {
                            userStates[userId] = { state: 'AWAITING_LEAD_NAME' };
                            await sendMessage(chatId, escapeMarkdownV2('Who is the lead? (Name)'));
                        }
                        continue;
                    }

                    if (text.startsWith('/book')) {
                        const content = text.replace('/book', '').trim();
                        const parts = content.split(',').map(p => p.trim());
                        if (parts.length >= 5) {
                            const [name, date, time, price, description] = parts;
                            const displayPrice = price.startsWith('$') ? price : `$${price}`;
                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Booked', [name, date, time, displayPrice, description]);
                                const startISO = parseToISO(date, time);
                                let calendarMsg = '';
                                if (startISO) {
                                    const endDate = new Date(new Date(startISO).getTime() + 2 * 60 * 60 * 1000);
                                    await googleService.addCalendarEvent(GOOGLE_CALENDAR_ID, {
                                        summary: `Cleaning: ${name} (${displayPrice})`,
                                        description: description,
                                        startDateTime: startISO,
                                        endDateTime: endDate.toISOString()
                                    });
                                    calendarMsg = ' & Calendar';
                                }
                                await sendMessage(chatId, `
✅ *Booking Confirmed\\!*
👤 *Client:* ${escapeMarkdownV2(name)}
📅 *Date:* ${escapeMarkdownV2(date)}
⏰ *Time:* ${escapeMarkdownV2(time)}
💰 *Price:* ${escapeMarkdownV2(displayPrice)}
📝 *Desc:* ${escapeMarkdownV2(description)}

_Saved to Sheet${calendarMsg}_
                                `.trim());
                            } catch (err) { await sendMessage(chatId, '❌ Failed to process booking\\. Check server console\\.'); }
                        } else {
                            userStates[userId] = { state: 'AWAITING_BOOK_NAME' };
                            await sendMessage(chatId, escapeMarkdownV2('Who is the client? (Name)'));
                        }
                        continue;
                    }

                    if (text.startsWith('/invoice')) {
                        const parts = text.split(' ');
                        if (parts.length >= 3) {
                            const amount = parseFloat(parts[1]);
                            if (isNaN(amount)) {
                                await sendMessage(chatId, '❌ Invalid amount\\. Please enter a number\\.');
                                continue;
                            }
                            const description = parts.slice(2).join(' ');
                            const jobId = generateJobId();
                            DB.createJob(jobId, amount, description);

                            // Log to Google Sheets
                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Invoices', [
                                    jobId, `$${amount.toFixed(2)}`, description, 'UNPAID', new Date().toLocaleString()
                                ]);
                            } catch (e) { console.error('Failed to log invoice to Sheet'); }

                            const payUrl = `${WEB_APP_URL}/?jobId=${jobId}`;
                            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;
                            await sendPhoto(chatId, qrUrl, `✅ *Invoice Created\\!*\n\n💰 *Amount:* $${escapeMarkdownV2(amount.toFixed(2))}\n📝 *Job:* ${escapeMarkdownV2(description)}\n\n🔗 *Payment Link:*\n[${escapeMarkdownV2(payUrl)}](${escapeLinkUrl(payUrl)})`, {
                                inline_keyboard: [[{ text: "🔗 Open Payment Page", url: payUrl }]]
                            });
                            userStates[userId] = null;
                        } else {
                            userStates[userId] = { state: 'AWAITING_AMOUNT' };
                            await sendMessage(chatId, escapeMarkdownV2('How much is the invoice for? Enter a number.'));
                        }
                        continue;
                    }

                    // --- INTERACTIVE FLOW HANDLER ---

                    if (userStates[userId]) {
                        const state = userStates[userId].state;

                        // Invoice Flow
                        if (state === 'AWAITING_AMOUNT') {
                            const amount = parseFloat(text);
                            if (isNaN(amount)) {
                                await sendMessage(chatId, '❌ Invalid amount\\. Please enter a number \\(e\\.g\\. 125\\)\\.');
                                continue;
                            }
                            userStates[userId] = { state: 'AWAITING_DESCRIPTION', amount };
                            await sendMessage(chatId, escapeMarkdownV2('What is the description for this invoice?'));
                            continue;
                        }
                        if (state === 'AWAITING_DESCRIPTION') {
                            const description = text;
                            const amount = userStates[userId].amount;
                            const jobId = generateJobId();
                            DB.createJob(jobId, amount, description);
                            
                            // Log to Google Sheets
                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Invoices', [
                                    jobId, `$${amount.toFixed(2)}`, description, 'UNPAID', new Date().toLocaleString()
                                ]);
                            } catch (e) { console.error('Failed to log invoice to Sheet'); }

                            userStates[userId] = null;
                            const payUrl = `${WEB_APP_URL}/?jobId=${jobId}`;
                            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;
                            await sendPhoto(chatId, qrUrl, `✅ *Invoice Created\\!*\n\n💰 *Amount:* $${escapeMarkdownV2(amount.toFixed(2))}\n📝 *Job:* ${escapeMarkdownV2(description)}\n\n🔗 *Payment Link:*\n[${escapeMarkdownV2(payUrl)}](${escapeLinkUrl(payUrl)})`, {
                                inline_keyboard: [[{ text: "🔗 Open Payment Page", url: payUrl }]]
                            });
                            continue;
                        }

                        // Lead Flow
                        if (state === 'AWAITING_LEAD_NAME') {
                            userStates[userId] = { state: 'AWAITING_LEAD_PHONE', name: text };
                            await sendMessage(chatId, escapeMarkdownV2('What is the phone number? (Type "?" if unknown)'));
                            continue;
                        }
                        if (state === 'AWAITING_LEAD_PHONE') {
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_LEAD_DESCRIPTION', phone: text };
                            await sendMessage(chatId, escapeMarkdownV2('Enter a description for this lead:'));
                            continue;
                        }
                        if (state === 'AWAITING_LEAD_DESCRIPTION') {
                            const { name, phone } = userStates[userId];
                            const description = text;
                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Leads', [name, phone, description, new Date().toLocaleDateString()]);
                                await sendMessage(chatId, `
✅ *Lead Saved\\!*
👤 *Name:* ${escapeMarkdownV2(name)}
📞 *Phone:* ${escapeMarkdownV2(phone)}
📝 *Desc:* ${escapeMarkdownV2(description)}
                                `.trim());
                            } catch (e) { await sendMessage(chatId, '❌ Failed to add lead\\. Check server console\\.'); }
                            userStates[userId] = null;
                            continue;
                        }

                        // Booking Flow
                        if (state === 'AWAITING_BOOK_NAME') {
                            userStates[userId] = { state: 'AWAITING_BOOK_DATE', name: text };
                            await sendMessage(chatId, escapeMarkdownV2('What is the date? (e.g. Oct 12)'));
                            continue;
                        }
                        if (state === 'AWAITING_BOOK_DATE') {
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_BOOK_TIME', date: text };
                            await sendMessage(chatId, escapeMarkdownV2('What time? (e.g. 10am)'));
                            continue;
                        }
                        if (state === 'AWAITING_BOOK_TIME') {
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_BOOK_PRICE', time: text };
                            await sendMessage(chatId, escapeMarkdownV2('What is the price? (Numbers only)'));
                            continue;
                        }
                        if (state === 'AWAITING_BOOK_PRICE') {
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_BOOK_DESCRIPTION', price: text };
                            await sendMessage(chatId, escapeMarkdownV2('Enter the job description:'));
                            continue;
                        }
                        if (state === 'AWAITING_BOOK_DESCRIPTION') {
                            const { name, date, time, price } = userStates[userId];
                            const description = text;
                            const displayPrice = price.startsWith('$') ? price : `$${price}`;
                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Booked', [name, date, time, displayPrice, description]);
                                const startISO = parseToISO(date, time);
                                let calendarMsg = '';
                                if (startISO) {
                                    const endDate = new Date(new Date(startISO).getTime() + 2 * 60 * 60 * 1000);
                                    await googleService.addCalendarEvent(GOOGLE_CALENDAR_ID, {
                                        summary: `Cleaning: ${name} (${displayPrice})`,
                                        description: description,
                                        startDateTime: startISO,
                                        endDateTime: endDate.toISOString()
                                    });
                                    calendarMsg = ' & Calendar';
                                }
                                await sendMessage(chatId, `
✅ *Booking Confirmed\\!*
👤 *Client:* ${escapeMarkdownV2(name)}
📅 *Date:* ${escapeMarkdownV2(date)}
⏰ *Time:* ${escapeMarkdownV2(time)}
💰 *Price:* ${escapeMarkdownV2(displayPrice)}
📝 *Desc:* ${escapeMarkdownV2(description)}

_Saved to Sheet${calendarMsg}_
                                `.trim());
                            } catch (e) { await sendMessage(chatId, '❌ Failed to process booking\\. Check server console\\.'); }
                            userStates[userId] = null;
                            continue;
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
