function refreshBookedView() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = ss.getSheetByName('Booked');
  if (!source) throw new Error('Sheet "Booked" not found');

  let view = ss.getSheetByName('Calendar');
  if (!view) {
    view = ss.insertSheet('Calendar');
  }

  const lastRow = source.getLastRow();
  const lastCol = source.getLastColumn();
  if (lastRow < 2) {
    view.clear();
    return;
  }

  const data = source.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(h => String(h).trim());

  const requiredHeaders = ['Client', 'Date', 'Time', 'Price', 'Description', 'Sorted', 'Status'];
  const missing = requiredHeaders.filter(h => !headers.includes(h));
  if (missing.length) {
    throw new Error(`Booked sheet is missing required columns: ${missing.join(', ')}`);
  }

  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const grouped = new Map();

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const client = row[idx.Client];
    const sorted = normalizeViewSortedDate(row[idx.Sorted]);

    if (!String(client || '').trim()) continue;
    if (!sorted) continue;

    const monthKey = sorted.slice(0, 7);
    if (!grouped.has(monthKey)) grouped.set(monthKey, []);

    grouped.get(monthKey).push([
      row[idx.Client] ?? '',
      row[idx.Date] ?? '',
      row[idx.Time] ?? '',
      row[idx.Price] ?? '',
      row[idx.Description] ?? '',
      sorted,
      row[idx.Status] ?? ''
    ]);
  }

  const monthKeys = Array.from(grouped.keys()).sort();
  const output = [];
  const monthHeaderRows = [];
  const tableHeaderRows = [];
  const dataRows = [];
  const blankRows = [];
  let currentRow = 1;

  for (const monthKey of monthKeys) {
    output.push([formatViewMonthLabel(monthKey), '', '', '', '', '', '']);
    monthHeaderRows.push(currentRow);
    currentRow++;

    output.push(['Client', 'Date', 'Time', 'Price', 'Description', 'Sorted', 'Status']);
    tableHeaderRows.push(currentRow);
    currentRow++;

    const rows = grouped.get(monthKey).sort((a, b) => String(a[5]).localeCompare(String(b[5])));
    for (const row of rows) {
      output.push(row);
      dataRows.push(currentRow);
      currentRow++;
    }

    for (let i = 0; i < 3; i++) {
      output.push(['', '', '', '', '', '', '']);
      blankRows.push(currentRow);
      currentRow++;
    }
  }

  view.clear();
  view.clearConditionalFormatRules();

  if (!output.length) return;

  view.getRange(1, 1, output.length, 7).setValues(output);

  view.getRange(1, 1, output.length, 7)
    .setVerticalAlignment('middle')
    .setWrap(false);

  view.getRange(1, 5, output.length, 1)
    .setWrap(true)
    .setVerticalAlignment('top')
    .setHorizontalAlignment('left');

  if (output.length > 0) {
    view.getRange(1, 2, output.length, 3).setHorizontalAlignment('center');
  }

  const bookedGreen = '#19994d';
  const darkerGreen = '#127338';
  const lightGreen = '#f7fff7';
  const white = '#ffffff';

  for (const rowNum of monthHeaderRows) {
    view.getRange(rowNum, 1, 1, 1)
      .setBackground(darkerGreen)
      .setFontColor(white)
      .setFontWeight('bold')
      .setFontSize(18)
      .setHorizontalAlignment('left')
      .setVerticalAlignment('middle');

    view.getRange(rowNum, 2, 1, 6).setBackground(white);
    view.setRowHeight(rowNum, 40);
  }

  for (const rowNum of tableHeaderRows) {
    view.getRange(rowNum, 1, 1, 7)
      .setBackground(bookedGreen)
      .setFontColor(white)
      .setFontWeight('bold')
      .setFontSize(11)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    view.setRowHeight(rowNum, 30);
  }

  let zebra = false;
  for (const rowNum of dataRows) {
    if (zebra) {
      view.getRange(rowNum, 1, 1, 7).setBackground(lightGreen);
    } else {
      view.getRange(rowNum, 1, 1, 7).setBackground(white);
    }
    zebra = !zebra;
  }

  for (const rowNum of blankRows) {
    view.getRange(rowNum, 1, 1, 7).setBackground(white);
    view.setRowHeight(rowNum, 20);
  }

  view.autoResizeRows(1, output.length);
  for (const rowNum of monthHeaderRows) view.setRowHeight(rowNum, 40);
  for (const rowNum of tableHeaderRows) view.setRowHeight(rowNum, 30);
  for (const rowNum of blankRows) view.setRowHeight(rowNum, 20);

  view.autoResizeColumns(1, 7);

  const currentWidth = view.getColumnWidth(5);
  if (currentWidth < 260) {
    view.setColumnWidth(5, 260);
  }

  view.setFrozenRows(0);
}

function normalizeViewSortedDate(value) {
  if (!value && value !== 0) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatViewIsoDate(value);
  }

  const str = String(value).trim();
  if (!str) return '';

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return str;

  const slash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = slash[1].padStart(2, '0');
    const day = slash[2].padStart(2, '0');
    return `${slash[3]}-${month}-${day}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatViewIsoDate(parsed);
  }

  return '';
}

function formatViewIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatViewMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMMM yyyy');
}
