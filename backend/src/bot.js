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
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const RECEIPTS_DRIVE_FOLDER_ID = process.env.RECEIPTS_DRIVE_FOLDER_ID;

console.log('DEBUG: Google IDs loaded:', { 
    sheet: GOOGLE_SHEET_ID ? 'YES' : 'NO', 
    calendar: GOOGLE_CALENDAR_ID ? 'YES' : 'NO',
    receiptsFolder: RECEIPTS_DRIVE_FOLDER_ID ? 'YES' : 'NO'
});

const WHITELISTED_USERS = (process.env.WHITELISTED_USERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

const googleService = new GoogleService();
const userStates = {};
const MONTHS = new Map([
    ['january', 0], ['jan', 0],
    ['february', 1], ['feb', 1],
    ['march', 2], ['mar', 2],
    ['april', 3], ['apr', 3],
    ['may', 4],
    ['june', 5], ['jun', 5],
    ['july', 6], ['jul', 6],
    ['august', 7], ['aug', 7],
    ['september', 8], ['sep', 8], ['sept', 8],
    ['october', 9], ['oct', 9],
    ['november', 10], ['nov', 10],
    ['december', 11], ['dec', 11]
]);
const WEEKDAYS = new Map([
    ['sunday', 0], ['sun', 0],
    ['monday', 1], ['mon', 1],
    ['tuesday', 2], ['tue', 2], ['tues', 2],
    ['wednesday', 3], ['wed', 3],
    ['thursday', 4], ['thu', 4], ['thur', 4], ['thurs', 4],
    ['friday', 5], ['fri', 5],
    ['saturday', 6], ['sat', 6]
]);

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

function normalizeWhitespace(str) {
    return String(str || '').trim().replace(/\s+/g, ' ');
}

function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function buildLocalDate(year, monthIndex, day) {
    const date = new Date(year, monthIndex, day);
    if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== monthIndex ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function formatNormalizedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function resolveMonthDay(monthIndex, day, year, hasExplicitYear, now) {
    const today = startOfLocalDay(now);
    let resolvedYear = year;
    let candidate = buildLocalDate(resolvedYear, monthIndex, day);

    if (!candidate) return null;

    if (!hasExplicitYear && candidate < today) {
        resolvedYear += 1;
        candidate = buildLocalDate(resolvedYear, monthIndex, day);
    }

    return candidate;
}

function parseRelativeWeekday(raw, now) {
    const weekdayMatch = raw.match(/^(?:(next|this)\s+)?(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
    if (!weekdayMatch) return null;

    const modifier = weekdayMatch[1] || '';
    const targetDay = WEEKDAYS.get(weekdayMatch[2]);
    const today = startOfLocalDay(now);
    const todayDay = today.getDay();
    let delta = (targetDay - todayDay + 7) % 7;

    if (modifier === 'next') {
        delta = delta === 0 ? 7 : delta;
    } else if (modifier === 'this') {
        if (delta === 0) return today;
    }

    return addDays(today, delta);
}

function parseTimeParts(timeStr) {
    const normalized = normalizeWhitespace(timeStr).toLowerCase().replace(/\./g, '');
    if (!normalized) return null;

    const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3];

    if (minutes > 59) return null;

    if (meridiem) {
        if (hours < 1 || hours > 12) return null;
        if (meridiem === 'am') {
            hours = hours === 12 ? 0 : hours;
        } else {
            hours = hours === 12 ? 12 : hours + 12;
        }
    } else {
        if (hours > 23) return null;

        // Apply booking-hour assumptions for bare numeric times.
        if (!match[2] && hours >= 1 && hours <= 6) {
            hours += 12;
        } else if (!match[2] && hours === 12) {
            hours = 12;
        } else if (!match[2] && hours >= 7 && hours <= 11) {
            hours = hours;
        }
    }

    return { hours, minutes };
}

function formatNormalizedTime(timeParts) {
    const hours24 = String(timeParts.hours).padStart(2, '0');
    const minutes = String(timeParts.minutes).padStart(2, '0');
    return `${hours24}:${minutes}`;
}

function normalizeBookingDate(input, now = new Date()) {
    const raw = normalizeWhitespace(input)
        .toLowerCase()
        .replace(/,/g, ' ')
        .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, '$1');

    if (!raw) return null;

    const today = startOfLocalDay(now);

    if (raw === 'today') return formatNormalizedDate(today);
    if (raw === 'tomorrow') return formatNormalizedDate(addDays(today, 1));
    if (raw === 'day after tomorrow') return formatNormalizedDate(addDays(today, 2));

    const weekdayDate = parseRelativeWeekday(raw, now);
    if (weekdayDate) return formatNormalizedDate(weekdayDate);

    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const candidate = buildLocalDate(
            parseInt(isoMatch[1], 10),
            parseInt(isoMatch[2], 10) - 1,
            parseInt(isoMatch[3], 10)
        );
        return candidate ? formatNormalizedDate(candidate) : null;
    }

    const numericMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);
    if (numericMatch) {
        const monthIndex = parseInt(numericMatch[1], 10) - 1;
        const day = parseInt(numericMatch[2], 10);
        let year = numericMatch[3] ? parseInt(numericMatch[3], 10) : today.getFullYear();

        if (monthIndex < 0 || monthIndex > 11) return null;
        if (numericMatch[3] && numericMatch[3].length === 2) {
            year += year >= 70 ? 1900 : 2000;
        }

        const candidate = resolveMonthDay(monthIndex, day, year, Boolean(numericMatch[3]), now);
        return candidate ? formatNormalizedDate(candidate) : null;
    }

    const monthFirstMatch = raw.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{2,4}))?$/);
    if (monthFirstMatch && MONTHS.has(monthFirstMatch[1])) {
        let year = monthFirstMatch[3] ? parseInt(monthFirstMatch[3], 10) : today.getFullYear();
        if (monthFirstMatch[3] && monthFirstMatch[3].length === 2) {
            year += year >= 70 ? 1900 : 2000;
        }

        const candidate = resolveMonthDay(
            MONTHS.get(monthFirstMatch[1]),
            parseInt(monthFirstMatch[2], 10),
            year,
            Boolean(monthFirstMatch[3]),
            now
        );
        return candidate ? formatNormalizedDate(candidate) : null;
    }

    const dayFirstMatch = raw.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{2,4}))?$/);
    if (dayFirstMatch && MONTHS.has(dayFirstMatch[2])) {
        let year = dayFirstMatch[3] ? parseInt(dayFirstMatch[3], 10) : today.getFullYear();
        if (dayFirstMatch[3] && dayFirstMatch[3].length === 2) {
            year += year >= 70 ? 1900 : 2000;
        }

        const candidate = resolveMonthDay(
            MONTHS.get(dayFirstMatch[2]),
            parseInt(dayFirstMatch[1], 10),
            year,
            Boolean(dayFirstMatch[3]),
            now
        );
        return candidate ? formatNormalizedDate(candidate) : null;
    }

    return null;
}

async function createJob(jobId, amount, description) {
    const apiBase = (BACKEND_BASE_URL || '').replace(/\/$/, '');
    if (apiBase) {
        try {
            const response = await fetch(`${apiBase}/v1/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: jobId, amount, description })
            });
            if (response.ok) return;

            const errorText = await response.text();
            log('WARN', 'Remote job create failed, falling back to local DB', {
                jobId,
                status: response.status,
                error: errorText
            });
        } catch (err) {
            log('WARN', 'Remote job create error, falling back to local DB', {
                jobId,
                error: err.message
            });
        }
    }

    DB.createJob(jobId, amount, description);
}

async function getTelegramFileUrl(fileId) {
    if (!fileId) return '';
    try {
        const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
        const data = await resp.json();
        if (!data.ok || !data.result?.file_path) return '';
        return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
    } catch {
        return '';
    }
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

function parseToISO(dateStr, timeStr) {
    try {
        const normalizedDate = normalizeBookingDate(dateStr);
        const timeParts = parseTimeParts(timeStr);
        if (!normalizedDate || !timeParts) return null;

        return `${normalizedDate}T${formatNormalizedTime(timeParts)}:00`;
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
                            else if (state.includes('TAX')) cmdName = 'tax';
                            else if (state.includes('REVENUE')) cmdName = 'revenue';
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
🧾 \`/tax\` \\- Log purchase \\+ receipt
💵 \`/revenue\` \\- Log cash or other job revenue
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
_Ex: \`/book John, Oct 12, 10am, 150, Full\` or \`/book John, next friday, 10am, 150, Full\`_

🧾 *Tax Purchases*
\`/tax [amount] [description]\`
_Ex: \`/tax 84.20 Filters and cleaner\`_

💵 *Revenue*
\`/revenue\`
_Use interactive mode to log a revenue entry_

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
                            const [name, rawDate, time, price, ...descriptionParts] = parts;
                            const normalizedDate = normalizeBookingDate(rawDate);
                            if (!normalizedDate) {
                                await sendMessage(chatId, escapeMarkdownV2('Invalid booking date. Try values like "Oct 12", "10/12/2026", "tomorrow", or "next friday".'));
                                continue;
                            }
                            const normalizedTimeParts = parseTimeParts(time);
                            if (!normalizedTimeParts) {
                                await sendMessage(chatId, escapeMarkdownV2('Invalid booking time. Try values like 10am, 10:30am, 2pm, or 14:30.'));
                                continue;
                            }

                            const description = descriptionParts.join(', ');
                            const displayPrice = price.startsWith('$') ? price : `$${price}`;
                            const normalizedTime = formatNormalizedTime(normalizedTimeParts);
                            let savedToSheet = false;
                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Booked', [name, normalizedDate, normalizedTime, displayPrice, description]);
                                savedToSheet = true;
                                const startDateTime = parseToISO(normalizedDate, normalizedTime);
                                if (!startDateTime) throw new Error('Could not build calendar start time from booking input');

                                const endDate = new Date(`${startDateTime}:00`);
                                endDate.setHours(endDate.getHours() + 2);
                                const endDateTime = `${formatNormalizedDate(endDate)}T${formatNormalizedTime({
                                    hours: endDate.getHours(),
                                    minutes: endDate.getMinutes()
                                })}:00`;

                                await googleService.addCalendarEvent(GOOGLE_CALENDAR_ID, {
                                    summary: `Cleaning: ${name} (${displayPrice})`,
                                    description: description,
                                    startDateTime,
                                    endDateTime
                                });
                                await sendMessage(chatId, `
✅ *Booking Confirmed\\!*
👤 *Client:* ${escapeMarkdownV2(name)}
📅 *Date:* ${escapeMarkdownV2(normalizedDate)}
⏰ *Time:* ${escapeMarkdownV2(normalizedTime)}
💰 *Price:* ${escapeMarkdownV2(displayPrice)}
📝 *Desc:* ${escapeMarkdownV2(description)}

_Saved to Sheet & Calendar_
                                `.trim());
                            } catch (err) {
                                const errorText = err?.message ? String(err.message) : 'Unknown error';
                                if (savedToSheet) {
                                    await sendMessage(chatId, `❌ Booking saved to Sheet, but Calendar failed\\.\n\nReason: ${escapeMarkdownV2(errorText)}`);
                                } else {
                                    await sendMessage(chatId, `❌ Failed to process booking\\.\n\nReason: ${escapeMarkdownV2(errorText)}`);
                                }
                            }
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
                            await createJob(jobId, amount, description);

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

                    if (text.startsWith('/tax')) {
                        const content = text.replace('/tax', '').trim();
                        if (!content) {
                            userStates[userId] = { state: 'AWAITING_TAX_AMOUNT' };
                            await sendMessage(chatId, escapeMarkdownV2('How much did this purchase cost? Enter a number.'));
                            continue;
                        }

                        const contentParts = content.split(' ').filter(Boolean);
                        const amount = parseFloat(contentParts[0]);
                        if (isNaN(amount)) {
                            await sendMessage(chatId, '❌ Invalid amount\\. Please enter a number\\.');
                            continue;
                        }

                        const description = contentParts.slice(1).join(' ').trim();
                        if (description) {
                            userStates[userId] = { state: 'AWAITING_TAX_RECEIPT', amount, description };
                            await sendMessage(chatId, escapeMarkdownV2('Now upload a picture of the reciept.'));
                        } else {
                            userStates[userId] = { state: 'AWAITING_TAX_DESCRIPTION', amount };
                            await sendMessage(chatId, escapeMarkdownV2('Enter purchase description.'));
                        }
                        continue;
                    }

                    if (text.startsWith('/revenue')) {
                        userStates[userId] = { state: 'AWAITING_REVENUE_CLIENT' };
                        await sendMessage(chatId, escapeMarkdownV2('Who is the client?'));
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
                            await createJob(jobId, amount, description);
                            
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
                            await sendMessage(chatId, escapeMarkdownV2('What is the date? (e.g. Oct 12, tomorrow, next friday, 10/12/2026)'));
                            continue;
                        }
                        if (state === 'AWAITING_BOOK_DATE') {
                            const normalizedDate = normalizeBookingDate(text);
                            if (!normalizedDate) {
                                await sendMessage(chatId, escapeMarkdownV2('I could not understand that date. Try values like Oct 12, tomorrow, next friday, or 10/12/2026.'));
                                continue;
                            }
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_BOOK_TIME', date: normalizedDate };
                            await sendMessage(chatId, escapeMarkdownV2('What time? (e.g. 10am)'));
                            continue;
                        }
                        if (state === 'AWAITING_BOOK_TIME') {
                            const normalizedTimeParts = parseTimeParts(text);
                            if (!normalizedTimeParts) {
                                await sendMessage(chatId, escapeMarkdownV2('I could not understand that time. Try values like 10am, 10:30am, 2pm, or 14:30.'));
                                continue;
                            }
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_BOOK_PRICE', time: formatNormalizedTime(normalizedTimeParts) };
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
                            let savedToSheet = false;
                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Booked', [name, date, time, displayPrice, description]);
                                savedToSheet = true;
                                const startDateTime = parseToISO(date, time);
                                if (!startDateTime) throw new Error('Could not build calendar start time from booking input');

                                const endDate = new Date(`${startDateTime}:00`);
                                endDate.setHours(endDate.getHours() + 2);
                                const endDateTime = `${formatNormalizedDate(endDate)}T${formatNormalizedTime({
                                    hours: endDate.getHours(),
                                    minutes: endDate.getMinutes()
                                })}:00`;

                                await googleService.addCalendarEvent(GOOGLE_CALENDAR_ID, {
                                    summary: `Cleaning: ${name} (${displayPrice})`,
                                    description: description,
                                    startDateTime,
                                    endDateTime
                                });
                                await sendMessage(chatId, `
✅ *Booking Confirmed\\!*
👤 *Client:* ${escapeMarkdownV2(name)}
📅 *Date:* ${escapeMarkdownV2(date)}
⏰ *Time:* ${escapeMarkdownV2(time)}
💰 *Price:* ${escapeMarkdownV2(displayPrice)}
📝 *Desc:* ${escapeMarkdownV2(description)}

_Saved to Sheet & Calendar_
                                `.trim());
                            } catch (e) {
                                const errorText = e?.message ? String(e.message) : 'Unknown error';
                                if (savedToSheet) {
                                    await sendMessage(chatId, `❌ Booking saved to Sheet, but Calendar failed\\.\n\nReason: ${escapeMarkdownV2(errorText)}`);
                                } else {
                                    await sendMessage(chatId, `❌ Failed to process booking\\.\n\nReason: ${escapeMarkdownV2(errorText)}`);
                                }
                            }
                            userStates[userId] = null;
                            continue;
                        }

                        // Tax Flow
                        if (state === 'AWAITING_TAX_AMOUNT') {
                            const amount = parseFloat(text);
                            if (isNaN(amount)) {
                                await sendMessage(chatId, '❌ Invalid amount\\. Please enter a number \\(e\\.g\\. 84\\.20\\)\\.');
                                continue;
                            }
                            userStates[userId] = { state: 'AWAITING_TAX_DESCRIPTION', amount };
                            await sendMessage(chatId, escapeMarkdownV2('Enter purchase description.'));
                            continue;
                        }
                        if (state === 'AWAITING_TAX_DESCRIPTION') {
                            const description = text.trim();
                            if (!description) {
                                await sendMessage(chatId, escapeMarkdownV2('Description cannot be empty. Enter purchase description.'));
                                continue;
                            }
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_TAX_RECEIPT', description };
                            await sendMessage(chatId, escapeMarkdownV2('Now upload a picture of the reciept.'));
                            continue;
                        }
                        if (state === 'AWAITING_TAX_RECEIPT') {
                            if (!msg.photo || msg.photo.length === 0) {
                                await sendMessage(chatId, escapeMarkdownV2('Please upload a receipt image. Send /cancel to stop.'));
                                continue;
                            }

                            const amount = userStates[userId].amount;
                            const description = userStates[userId].description || '';
                            const largestPhoto = msg.photo[msg.photo.length - 1];
                            const telegramFileId = largestPhoto.file_id;
                            const telegramFileUrl = await getTelegramFileUrl(telegramFileId);

                            try {
                                const upload = await googleService.uploadReceiptToDrive({
                                    fileUrl: telegramFileUrl,
                                    fileName: `receipt_${userId}_${Date.now()}`,
                                    folderId: RECEIPTS_DRIVE_FOLDER_ID
                                });
                                const createdAt = new Date().toLocaleString([], {
                                    year: 'numeric',
                                    month: 'numeric',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                });

                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Taxes', [
                                    `$${amount.toFixed(2)}`,
                                    description,
                                    upload.previewFormula,
                                    createdAt,
                                    upload.receiptUrl,
                                    telegramFileId,
                                    upload.driveFileId
                                ]);
                                await sendMessage(chatId, `
✅ *Tax Purchase Saved\\!*
💰 *Amount:* ${escapeMarkdownV2(`$${amount.toFixed(2)}`)}
📝 *Description:* ${escapeMarkdownV2(description)}
🧾 *Receipt:* Uploaded to Drive
                                `.trim());
                            } catch (e) {
                                const errorMsg = e?.message ? String(e.message) : 'Unknown error';
                                console.error('[TAX] Failed to save purchase:', errorMsg);
                                await sendMessage(chatId, `❌ Failed to save tax purchase\\.\n\nReason: ${escapeMarkdownV2(errorMsg)}`);
                            }
                            userStates[userId] = null;
                            continue;
                        }

                        // Revenue Flow
                        if (state === 'AWAITING_REVENUE_CLIENT') {
                            const client = text.trim();
                            if (!client) {
                                await sendMessage(chatId, escapeMarkdownV2('Client cannot be empty. Who is the client?'));
                                continue;
                            }
                            userStates[userId] = { state: 'AWAITING_REVENUE_AMOUNT', client };
                            await sendMessage(chatId, escapeMarkdownV2('How much revenue was collected? Enter a number.'));
                            continue;
                        }
                        if (state === 'AWAITING_REVENUE_AMOUNT') {
                            const amount = parseFloat(text);
                            if (isNaN(amount)) {
                                await sendMessage(chatId, '❌ Invalid amount\\. Please enter a number \\(e\\.g\\. 250\\)\\.');
                                continue;
                            }
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_REVENUE_PAYMENT_METHOD', amount };
                            await sendMessage(chatId, escapeMarkdownV2('What was the payment method? (Cash, Venmo, Crypto, Card, etc.)'));
                            continue;
                        }
                        if (state === 'AWAITING_REVENUE_PAYMENT_METHOD') {
                            const paymentMethod = text.trim();
                            if (!paymentMethod) {
                                await sendMessage(chatId, escapeMarkdownV2('Payment method cannot be empty. Enter the payment method.'));
                                continue;
                            }
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_REVENUE_NOTES', paymentMethod };
                            await sendMessage(chatId, escapeMarkdownV2('Enter notes for this entry. Include anything important like who did it, tips, etc.'));
                            continue;
                        }
                        if (state === 'AWAITING_REVENUE_NOTES') {
                            const notes = text.trim();
                            if (!notes) {
                                await sendMessage(chatId, escapeMarkdownV2('Notes cannot be empty. Enter notes for this revenue entry.'));
                                continue;
                            }
                            userStates[userId] = { ...userStates[userId], state: 'AWAITING_REVENUE_JOB_DESCRIPTION', notes };
                            await sendMessage(chatId, escapeMarkdownV2('What services did we do? Enter the job description.'));
                            continue;
                        }
                        if (state === 'AWAITING_REVENUE_JOB_DESCRIPTION') {
                            const jobDescription = text.trim();
                            if (!jobDescription) {
                                await sendMessage(chatId, escapeMarkdownV2('Job description cannot be empty. What services did we do?'));
                                continue;
                            }

                            const { client, amount, paymentMethod, notes } = userStates[userId];
                            const createdAt = new Date().toLocaleDateString();

                            try {
                                await googleService.addEntry(GOOGLE_SHEET_ID, 'Revenue', [
                                    createdAt,
                                    client,
                                    `$${amount.toFixed(2)}`,
                                    paymentMethod,
                                    notes,
                                    jobDescription
                                ]);
                                await sendMessage(chatId, `
✅ *Revenue Saved\\!*
👤 *Client:* ${escapeMarkdownV2(client)}
💰 *Amount:* ${escapeMarkdownV2(`$${amount.toFixed(2)}`)}
💳 *Method:* ${escapeMarkdownV2(paymentMethod)}
📒 *Notes:* ${escapeMarkdownV2(notes)}
📝 *Services:* ${escapeMarkdownV2(jobDescription)}
                                `.trim());
                            } catch (e) {
                                await sendMessage(chatId, '❌ Failed to add revenue entry\\. Check server console\\.');
                            }

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
