'use strict';

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '1g2GzzTF214d2-duyuriun-gIGgeHtcxFnXOQO2d4Drg';
const SHEET_NAME = 'Paket';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const headers = [
  'Cabang', 'Kode Paket', 'Nama Paket', 'Harga', 'Profile name (mikrotik)',
  'Max Limit (Mbps)', 'Burst Limit (Mbps)', 'Burst Threshold (Mbps)', 'Burst Time (detik)',
  'Max Limit (Mbps)', 'Burst Limit (Mbps)', 'Burst Threshold (Mbps)', 'Burst Time (detik)',
];
const numericColumns = new Set([0, 3, 5, 6, 7, 8, 9, 10, 11, 12]);

function token() {
  const value = process.env.GOOGLE_SHEETS_ACCESS_TOKEN || process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
  if (!value) throw new Error('Koneksi Google Sheets belum dikonfigurasi di environment Billing.');
  return value;
}

function cellValue(cell) {
  if (!cell) return '';
  if (cell.effectiveValue?.numberValue !== undefined) return cell.effectiveValue.numberValue;
  if (cell.effectiveValue?.boolValue !== undefined) return cell.effectiveValue.boolValue;
  return cell.effectiveValue?.stringValue ?? cell.formattedValue ?? '';
}

function rowsFromGrid(sheet) {
  const data = sheet.data?.[0]?.rowData || [];
  return data.map((row) => Array.from({ length: 13 }, (_, index) => cellValue(row.values?.[index])));
}

function formulaColumns(sheet) {
  const columns = new Set();
  for (const row of sheet.data?.[0]?.rowData || []) {
    (row.values || []).forEach((cell, index) => {
      if (cell.userEnteredValue?.formulaValue) columns.add(index);
    });
  }
  return columns;
}

async function sheetsRequest(path, options = {}) {
  const response = await fetch(`${SHEETS_API}/${SPREADSHEET_ID}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(body?.error?.message || `Google Sheets HTTP ${response.status}`);
  return body;
}

async function readPackageSheet() {
  const sheet = await sheetsRequest(`?ranges=${encodeURIComponent(SHEET_NAME)}&includeGridData=true`);
  const packageSheet = (sheet.sheets || []).find((item) => item.properties?.title === SHEET_NAME);
  if (!packageSheet) throw new Error('Tab Paket tidak ditemukan di Spreadsheet.');
  return {
    sheetId: packageSheet.properties.sheetId,
    rowCount: packageSheet.properties.gridProperties?.rowCount || 0,
    rows: rowsFromGrid(packageSheet),
    formulaColumns: [...formulaColumns(packageSheet)],
    properties: packageSheet.properties,
  };
}

function valueForDb(value, column) {
  if (value === '' || value === null || value === undefined) return null;
  if (numericColumns.has(column)) {
    const number = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number : null;
  }
  return String(value).trim();
}

function packageRecords(rows) {
  return rows.slice(2).map((row, index) => {
    const branchCode = valueForDb(row[0], 0);
    const packageCode = valueForDb(row[1], 1);
    if (!packageCode) return null;
    return {
      source_row_number: index + 3,
      branch_code: branchCode,
      package_code: packageCode,
      package_name: valueForDb(row[2], 2),
      price: valueForDb(row[3], 3) ?? 0,
      mikrotik_profile_name: valueForDb(row[4], 4),
      upload_max_limit_mbps: valueForDb(row[5], 5),
      upload_burst_limit_mbps: valueForDb(row[6], 6),
      upload_burst_threshold_mbps: valueForDb(row[7], 7),
      upload_burst_time_seconds: valueForDb(row[8], 8),
      download_max_limit_mbps: valueForDb(row[9], 9),
      download_burst_limit_mbps: valueForDb(row[10], 10),
      download_burst_threshold_mbps: valueForDb(row[11], 11),
      download_burst_time_seconds: valueForDb(row[12], 12),
    };
  }).filter(Boolean);
}

function packageKey(record) { return `${record.branch_code || ''}::${record.package_code || ''}`; }
function comparable(record) {
  return JSON.stringify({ ...record, id: undefined, source_row_id: undefined, raw_record: undefined });
}

async function writeRows(updates) {
  if (!updates.length) return { totalUpdatedCells: 0, totalUpdatedRows: 0 };
  return sheetsRequest('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', includeValuesInResponse: false, data: updates }),
  });
}

module.exports = { SPREADSHEET_ID, SHEET_NAME, headers, readPackageSheet, packageRecords, packageKey, comparable, writeRows };
