import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_PATH = path.join(__dirname, '../../service-account.json');

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive'
];

export class GoogleService {
    constructor() {
        this.auth = new google.auth.GoogleAuth({
            keyFile: KEY_PATH,
            scopes: SCOPES,
        });
        this.driveAuth = this.createDriveAuth();
        
        this.schema = {
            'Leads': ['Name', 'Phone', 'Description', 'Date'],
            'Booked': ['Client', 'Date', 'Time', 'Price', 'Description'],
            'Invoices': ['Invoice ID', 'Amount', 'Description', 'Status', 'Created At'],
            'Taxes': ['Amount', 'Description', 'Preview', 'Created At', 'Receipt URL', 'Telegram File ID', 'Drive File ID']
        };
    }

    createDriveAuth() {
        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

        if (clientId && clientSecret && refreshToken) {
            const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
            oauth2.setCredentials({ refresh_token: refreshToken });
            return oauth2;
        }

        // Fallback to service account if OAuth vars are missing.
        return this.auth;
    }

    async ensureSheet(spreadsheetId, title) {
        const sheets = google.sheets({ version: 'v4', auth: this.auth });
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheet = metadata.data.sheets.find(s => s.properties.title === title);

        if (!sheet) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{ addSheet: { properties: { title } } }]
                }
            });
        }

        const headers = this.schema[title];
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${title}!A1:Z1`,
        });

        if (!response.data.values || response.data.values[0].length === 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${title}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [headers] }
            });
        }
    }

    async addEntry(spreadsheetId, tabTitle, dataArray) {
        try {
            await this.ensureSheet(spreadsheetId, tabTitle);
            const sheets = google.sheets({ version: 'v4', auth: this.auth });
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${tabTitle}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [dataArray] },
            });
        } catch (err) {
            console.error(`[GOOGLE] Error adding to ${tabTitle}:`, err.message);
            throw err;
        }
    }

    /**
     * Updates the status of an invoice in the Invoices tab
     */
    async updateInvoiceStatus(spreadsheetId, jobId, status) {
        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth });
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Invoices!A:D',
            });

            const rows = response.data.values;
            if (!rows) return;

            const rowIndex = rows.findIndex(row => row[0] === jobId);
            if (rowIndex === -1) return;

            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `Invoices!D${rowIndex + 1}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[status]] }
            });
            console.log(`[GOOGLE] Invoice ${jobId} updated to ${status} in Sheet`);
        } catch (err) {
            console.error('[GOOGLE] Update Invoice Status Error:', err.message);
        }
    }

    async addCalendarEvent(calendarId, { summary, description, startDateTime, endDateTime }) {
        if (!calendarId) return;
        const calendar = google.calendar({ version: 'v3', auth: this.auth });
        try {
            await calendar.events.insert({
                calendarId,
                requestBody: {
                    summary,
                    description,
                    start: { dateTime: startDateTime, timeZone: 'America/New_York' },
                    end: { dateTime: endDateTime, timeZone: 'America/New_York' },
                },
            });
        } catch (err) {
            console.error('[GOOGLE] Calendar Error:', err.message);
        }
    }

    async uploadReceiptToDrive({ fileUrl, fileName, folderId }) {
        if (!fileUrl) throw new Error('Missing fileUrl');
        if (!folderId) throw new Error('Missing RECEIPTS_DRIVE_FOLDER_ID');

        const drive = google.drive({ version: 'v3', auth: this.driveAuth });
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`Telegram file download failed: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : 'jpg';
        const buffer = Buffer.from(await response.arrayBuffer());
        const safeName = (fileName || `receipt_${Date.now()}`).replace(/[^\w.-]/g, '_');
        const finalName = safeName.includes('.') ? safeName : `${safeName}.${ext}`;

        const createRes = await drive.files.create({
            requestBody: {
                name: finalName,
                parents: folderId ? [folderId] : undefined
            },
            media: {
                mimeType: contentType,
                body: Readable.from(buffer)
            },
            fields: 'id,name,webViewLink,webContentLink',
            supportsAllDrives: true
        });

        const driveFileId = createRes.data.id;
        if (!driveFileId) throw new Error('Drive file ID missing after upload');

        await drive.permissions.create({
            fileId: driveFileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            },
            supportsAllDrives: true
        });

        const receiptUrl = `https://drive.google.com/uc?export=view&id=${driveFileId}`;
        return {
            driveFileId,
            receiptUrl,
            previewFormula: `=IMAGE("${receiptUrl}")`
        };
    }
}
