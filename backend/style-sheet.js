import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const KEY_PATH = path.join(__dirname, 'service-account.json');
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function styleSheet() {
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        console.log('🔍 Fetching sheet IDs...');
        const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        
        const tabs = ['Leads', 'Booked', 'Jobs'];
        const styledTabs = [];

        tabs.forEach(title => {
            const sheet = metadata.data.sheets.find(s => s.properties.title === title);
            if (sheet) styledTabs.push({ title, id: sheet.properties.sheetId });
        });

        if (styledTabs.length === 0) {
            console.error('❌ No tabs found to style. Run /lead, /book, or /job first.');
            return;
        }

        console.log(`🎨 Styling ${styledTabs.length} tabs...`);

        const requests = [];

        styledTabs.forEach(tab => {
            let color = { red: 0.1, green: 0.4, blue: 0.8 }; // Default Blue
            let zebra = { red: 0.97, green: 0.98, blue: 1.0 };
            let cols = 4;

            if (tab.title === 'Booked') {
                color = { red: 0.1, green: 0.6, blue: 0.3 };
                zebra = { red: 0.97, green: 1.0, blue: 0.97 };
                cols = 5;
            } else if (tab.title === 'Jobs') {
                color = { red: 0.2, green: 0.2, blue: 0.2 }; // Dark Grey
                zebra = { red: 0.98, green: 0.98, blue: 0.98 };
                cols = 5;
            }

            // Header
            requests.push({
                repeatCell: {
                    range: { sheetId: tab.id, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: color,
                            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
                            horizontalAlignment: 'CENTER'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
            });

            // Freeze Header
            requests.push({
                updateSheetProperties: {
                    properties: { sheetId: tab.id, gridProperties: { frozenRowCount: 1 } },
                    fields: 'gridProperties.frozenRowCount'
                }
            });

            // Zebra Stripes
            requests.push({
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{ sheetId: tab.id, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: cols }],
                        booleanRule: {
                            condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=ISEVEN(ROW())' }] },
                            format: { backgroundColor: zebra }
                        }
                    },
                    index: 0
                }
            });

            // Auto-resize
            requests.push({
                autoResizeDimensions: {
                    dimensions: { sheetId: tab.id, dimension: 'COLUMNS', startIndex: 0, endIndex: cols }
                }
            });
        });

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests }
        });

        console.log('✅ All tabs styled successfully!');
    } catch (err) {
        console.error('❌ Styling failed:', err.message);
    }
}

styleSheet();
