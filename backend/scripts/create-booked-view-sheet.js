import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const KEY_PATH = path.join(__dirname, '../service-account.json');
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SOURCE_SHEET_TITLE = 'Booked';
const VIEW_SHEET_TITLE = 'Calendar';
const VIEW_HEADERS = ['Client', 'Date', 'Time', 'Price', 'Description', 'Sorted', 'Status'];

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

function getSheetByTitle(metadata, title) {
    return metadata.data.sheets.find(sheet => sheet.properties.title === title);
}

async function getSpreadsheetMetadata(sheets) {
    return sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
}

async function ensureSheet(sheets, title) {
    const metadata = await getSpreadsheetMetadata(sheets);
    const existing = getSheetByTitle(metadata, title);
    if (existing) return existing.properties.sheetId;

    const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            requests: [{
                addSheet: {
                    properties: { title }
                }
            }]
        }
    });

    return addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
}

async function clearConditionalRules(sheets, sheetId) {
    const metadata = await getSpreadsheetMetadata(sheets);
    const tab = metadata.data.sheets.find(sheet => sheet.properties.sheetId === sheetId);
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

function normalizeHeader(value) {
    return String(value || '').trim();
}

function normalizeSortableDate(value) {
    if (!value && value !== 0) return '';

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatIsoDate(value);
    }

    const str = String(value).trim();
    if (!str) return '';

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return str;

    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const month = slashMatch[1].padStart(2, '0');
        const day = slashMatch[2].padStart(2, '0');
        return `${slashMatch[3]}-${month}-${day}`;
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
        return formatIsoDate(parsed);
    }

    return '';
}

function formatIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatMonthLabel(isoDate) {
    const [year, month] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function buildViewRows(sourceRows, headerRow) {
    const indexMap = Object.fromEntries(headerRow.map((header, index) => [header, index]));
    const grouped = new Map();

    for (const row of sourceRows) {
        const client = row[indexMap.Client] ?? '';
        const sortedRaw = row[indexMap.Sorted] ?? '';
        const sorted = normalizeSortableDate(sortedRaw);
        if (!String(client).trim() || !sorted) continue;

        const monthKey = sorted.slice(0, 7);
        if (!grouped.has(monthKey)) grouped.set(monthKey, []);

        grouped.get(monthKey).push([
            row[indexMap.Client] ?? '',
            row[indexMap.Date] ?? '',
            row[indexMap.Time] ?? '',
            row[indexMap.Price] ?? '',
            row[indexMap.Description] ?? '',
            sorted,
            row[indexMap.Status] ?? ''
        ]);
    }

    const monthKeys = Array.from(grouped.keys()).sort();
    const rows = [];
    const monthHeaderRows = [];
    const tableHeaderRows = [];
    const dataRows = [];
    const blankRows = [];
    let currentRow = 1;

    for (const monthKey of monthKeys) {
        rows.push([formatMonthLabel(`${monthKey}-01`), '', '', '', '', '', '']);
        monthHeaderRows.push(currentRow);
        currentRow += 1;

        rows.push([...VIEW_HEADERS]);
        tableHeaderRows.push(currentRow);
        currentRow += 1;

        const monthRows = grouped.get(monthKey).sort((a, b) => String(a[5]).localeCompare(String(b[5])));
        for (const monthRow of monthRows) {
            rows.push(monthRow);
            dataRows.push(currentRow);
            currentRow += 1;
        }

        for (let i = 0; i < 3; i += 1) {
            rows.push(['', '', '', '', '', '', '']);
            blankRows.push(currentRow);
            currentRow += 1;
        }
    }

    return { rows, monthHeaderRows, tableHeaderRows, dataRows, blankRows };
}

async function createBookedViewSheet() {
    if (!SPREADSHEET_ID) {
        throw new Error('Missing GOOGLE_SHEET_ID in backend/.env');
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const metadata = await getSpreadsheetMetadata(sheets);
    const sourceSheet = getSheetByTitle(metadata, SOURCE_SHEET_TITLE);

    if (!sourceSheet) {
        throw new Error(`Source sheet "${SOURCE_SHEET_TITLE}" was not found`);
    }

    const sourceDataRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${SOURCE_SHEET_TITLE}'!A:G`
    });

    const sourceValues = sourceDataRes.data.values || [];
    if (sourceValues.length === 0) {
        throw new Error(`Source sheet "${SOURCE_SHEET_TITLE}" has no data`);
    }

    const headerRow = sourceValues[0].map(normalizeHeader);
    const requiredHeaders = ['Client', 'Date', 'Time', 'Price', 'Description', 'Sorted', 'Status'];
    const missingHeaders = requiredHeaders.filter(header => !headerRow.includes(header));
    if (missingHeaders.length > 0) {
        throw new Error(`Source sheet is missing required columns: ${missingHeaders.join(', ')}`);
    }

    const { rows, monthHeaderRows, tableHeaderRows, dataRows, blankRows } = buildViewRows(sourceValues.slice(1), headerRow);
    if (rows.length === 0) {
        throw new Error('No sortable Booked rows were found. Make sure the Sorted column is populated.');
    }

    const sheetId = await ensureSheet(sheets, VIEW_SHEET_TITLE);
    await clearConditionalRules(sheets, sheetId);

    await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${VIEW_SHEET_TITLE}'!A:Z`
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${VIEW_SHEET_TITLE}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows }
    });

    const bookedGreen = { red: 0.1, green: 0.6, blue: 0.3 };
    const lightGreen = { red: 0.97, green: 1.0, blue: 0.97 };
    const darkerGreen = { red: 0.07, green: 0.45, blue: 0.22 };

    const requests = [
        {
            updateSheetProperties: {
                properties: {
                    sheetId,
                    gridProperties: {
                        frozenRowCount: 0
                    }
                },
                fields: 'gridProperties.frozenRowCount'
            }
        },
        {
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: rows.length,
                    startColumnIndex: 0,
                    endColumnIndex: 7
                },
                cell: {
                    userEnteredFormat: {
                        verticalAlignment: 'MIDDLE',
                        wrapStrategy: 'CLIP'
                    }
                },
                fields: 'userEnteredFormat(verticalAlignment,wrapStrategy)'
            }
        },
        {
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: rows.length,
                    startColumnIndex: 1,
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
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: rows.length,
                    startColumnIndex: 4,
                    endColumnIndex: 5
                },
                cell: {
                    userEnteredFormat: {
                        horizontalAlignment: 'LEFT',
                        verticalAlignment: 'TOP',
                        wrapStrategy: 'WRAP'
                    }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy)'
            }
        },
        {
            autoResizeDimensions: {
                dimensions: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 0,
                    endIndex: 7
                }
            }
        },
        {
            autoResizeDimensions: {
                dimensions: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: 0,
                    endIndex: rows.length
                }
            }
        }
    ];

    for (const rowNumber of monthHeaderRows) {
        requests.push({
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: rowNumber - 1,
                    endRowIndex: rowNumber,
                    startColumnIndex: 0,
                    endColumnIndex: 1
                },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: darkerGreen,
                        textFormat: {
                            foregroundColor: { red: 1, green: 1, blue: 1 },
                            bold: true,
                            fontSize: 18
                        },
                        horizontalAlignment: 'LEFT',
                        verticalAlignment: 'MIDDLE'
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
        });
        requests.push({
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: rowNumber - 1,
                    endRowIndex: rowNumber,
                    startColumnIndex: 1,
                    endColumnIndex: 7
                },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 1, green: 1, blue: 1 }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor)'
            }
        });
    }

    for (const rowNumber of tableHeaderRows) {
        requests.push({
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: rowNumber - 1,
                    endRowIndex: rowNumber,
                    startColumnIndex: 0,
                    endColumnIndex: 7
                },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: bookedGreen,
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
        });
    }

    for (const rowNumber of dataRows) {
        if (rowNumber % 2 === 0) {
            requests.push({
                repeatCell: {
                    range: {
                        sheetId,
                        startRowIndex: rowNumber - 1,
                        endRowIndex: rowNumber,
                        startColumnIndex: 0,
                        endColumnIndex: 7
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: lightGreen
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor)'
                }
            });
        }
    }

    for (const rowNumber of blankRows) {
        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: rowNumber - 1,
                    endIndex: rowNumber
                },
                properties: {
                    pixelSize: 20
                },
                fields: 'pixelSize'
            }
        });
    }

    for (const rowNumber of monthHeaderRows) {
        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: rowNumber - 1,
                    endIndex: rowNumber
                },
                properties: {
                    pixelSize: 40
                },
                fields: 'pixelSize'
            }
        });
    }

    for (const rowNumber of tableHeaderRows) {
        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: rowNumber - 1,
                    endIndex: rowNumber
                },
                properties: {
                    pixelSize: 30
                },
                fields: 'pixelSize'
            }
        });
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests }
    });

    console.log(`Created or refreshed "${VIEW_SHEET_TITLE}" successfully.`);
    console.log('This is now a grouped month-by-month view generated from "Booked".');
    console.log('Delete the existing tab first if you want a fully clean rebuild, then rerun this script.');
}

createBookedViewSheet().catch(err => {
    console.error('Failed to create Booked View sheet:', err.message);
    process.exit(1);
});
