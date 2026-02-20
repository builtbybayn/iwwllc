import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_PATH = path.join(__dirname, '../../service-account.json');

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar'
];

export class GoogleService {
    constructor() {
        this.auth = new google.auth.GoogleAuth({
            keyFile: KEY_PATH,
            scopes: SCOPES,
        });
        
        this.schema = {
            'Leads': ['Name', 'Phone', 'Description', 'Date'],
            'Booked': ['Client', 'Date', 'Time', 'Price', 'Description'],
            'Invoices': ['Invoice ID', 'Amount', 'Description', 'Status', 'Created At']
        };
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
}
