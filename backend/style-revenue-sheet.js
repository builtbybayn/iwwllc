import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const KEY_PATH = path.join(__dirname, 'service-account.json');
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB_TITLE = 'Revenue';
const REVENUE_HEADERS = ['Date', 'Client', 'Amount', 'Payment Method', 'Notes', 'Job Description'];

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function ensureRevenueTab(sheets) {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    let tab = metadata.data.sheets.find(s => s.properties.title === TAB_TITLE);

    if (!tab) {
        const addRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [{ addSheet: { properties: { title: TAB_TITLE } } }]
            }
        });
        const newId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
        tab = { properties: { title: TAB_TITLE, sheetId: newId } };
    }

    const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB_TITLE}!A1:F1`
    });
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB_TITLE}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [REVENUE_HEADERS] }
    });

    return tab.properties.sheetId;
}

async function clearConditionalRules(sheets, sheetId) {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const tab = metadata.data.sheets.find(s => s.properties.sheetId === sheetId);
    const count = tab?.conditionalFormats?.length || 0;
    if (!count) return;

    const requests = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        requests.push({
            deleteConditionalFormatRule: {
                sheetId,
                index: i
            }
        });
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests }
    });
}

async function styleRevenueTab() {
    if (!SPREADSHEET_ID) {
        console.error('Missing GOOGLE_SHEET_ID in backend/.env');
        process.exit(1);
    }

    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const sheetId = await ensureRevenueTab(sheets);
        await clearConditionalRules(sheets, sheetId);

        const headerColor = { red: 0.1, green: 0.1, blue: 0.1 };
        const zebraColor = { red: 0.96, green: 0.96, blue: 0.96 };

        const requests = [
            {
                updateSheetProperties: {
                    properties: {
                        sheetId,
                        gridProperties: {
                            frozenRowCount: 1
                        }
                    },
                    fields: 'gridProperties.frozenRowCount'
                }
            },
            {
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'ROWS',
                        startIndex: 0,
                        endIndex: 1
                    },
                    properties: {
                        pixelSize: 36
                    },
                    fields: 'pixelSize'
                }
            },
            {
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: 0,
                        endIndex: 1
                    },
                    properties: {
                        pixelSize: 130
                    },
                    fields: 'pixelSize'
                }
            },
            {
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: 1,
                        endIndex: 2
                    },
                    properties: {
                        pixelSize: 170
                    },
                    fields: 'pixelSize'
                }
            },
            {
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: 2,
                        endIndex: 3
                    },
                    properties: {
                        pixelSize: 110
                    },
                    fields: 'pixelSize'
                }
            },
            {
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: 3,
                        endIndex: 4
                    },
                    properties: {
                        pixelSize: 150
                    },
                    fields: 'pixelSize'
                }
            },
            {
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: 4,
                        endIndex: 5
                    },
                    properties: {
                        pixelSize: 320
                    },
                    fields: 'pixelSize'
                }
            },
            {
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: 5,
                        endIndex: 6
                    },
                    properties: {
                        pixelSize: 260
                    },
                    fields: 'pixelSize'
                }
            },
            {
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 6
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: headerColor,
                            textFormat: {
                                foregroundColor: { red: 1, green: 1, blue: 1 },
                                bold: true,
                                fontSize: 11
                            },
                            horizontalAlignment: 'CENTER',
                            verticalAlignment: 'MIDDLE'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
                }
            },
            {
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: 1000,
                        startColumnIndex: 0,
                        endColumnIndex: 6
                    },
                    cell: {
                        userEnteredFormat: {
                            verticalAlignment: 'MIDDLE',
                            wrapStrategy: 'WRAP'
                        }
                    },
                    fields: 'userEnteredFormat(verticalAlignment,wrapStrategy)'
                }
            },
            {
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: 1000,
                        startColumnIndex: 2,
                        endColumnIndex: 4
                    },
                    cell: {
                        userEnteredFormat: {
                            horizontalAlignment: 'CENTER',
                            verticalAlignment: 'MIDDLE'
                        }
                    },
                    fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
                }
            },
            {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{
                            sheetId,
                            startRowIndex: 1,
                            endRowIndex: 1000,
                            startColumnIndex: 0,
                            endColumnIndex: 6
                        }],
                        booleanRule: {
                            condition: {
                                type: 'CUSTOM_FORMULA',
                                values: [{ userEnteredValue: '=ISEVEN(ROW())' }]
                            },
                            format: {
                                backgroundColor: zebraColor
                            }
                        }
                    },
                    index: 0
                }
            }
        ];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests }
        });

        console.log('Revenue tab styled successfully.');
    } catch (err) {
        console.error('Failed to style Revenue tab:', err.message);
        process.exit(1);
    }
}

styleRevenueTab();
