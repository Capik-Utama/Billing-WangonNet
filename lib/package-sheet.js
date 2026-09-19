'use strict';

const crypto = require('crypto');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '1g2GzzTF214d2-duyuriun-gIGgeHtcxFnXOQO2d4Drg';
const SHEET_NAME = 'Paket';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const headers = [
  'Cabang', 'Kode Paket', 'Nama Paket', 'Harga', 'Profile name (mikrotik)',
  'Max Limit (Mbps)', 'Burst Limit (Mbps)', 'Burst Threshold (Mbps)', 'Burst Time (detik)',
  'Max Limit (Mbps)', 'Burst Limit (Mbps)', 'Burst Threshold (Mbps)', 'Burst Time (detik)',
];
const numericColumns = new Set([0, 3, 5, 6, 7, 8, 9, 10, 11, 12]);

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function requestCookies(request) {
  return Object.fromEntries((request?.headers?.cookie || '').split(';').filter(Boolean).map((item) => { const i = item.indexOf('='); return [item.slice(0, i).trim(), decodeURIComponent(item.slice(i + 1).trim())]; }));
}

function spreadsheetId(request) {
  return requestCookies(request).google_sheet_target_id || process.env.GOOGLE_SHEET_ID || '1g2GzzTF214d2-duyuriun-gIGgeHtcxFnXOQO2d4Drg';
}

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64 ? Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64, 'base64').toString('utf8') : '');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON tidak berisi JSON yang valid.'); }
}

async function token(request) {
  const service = serviceAccount();
  if (service) {
    if (cachedToken && Date.now() < cachedTokenExpiresAt - 60000) return cachedToken;
    if (!service.client_email || !service.private_key) throw new Error('Service account Google harus memiliki client_email dan private_key.');
    const now = Math.floor(Date.now() / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const assertionHeader = encode({ alg: 'RS256', typ: 'JWT' });
    const assertionClaim = encode({ iss: service.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const unsigned = `${assertionHeader}.${assertionClaim}`;
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(service.private_key, 'base64url');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error_description || body.error || 'Token service account Google gagal.');
    cachedToken = body.access_token; cachedTokenExpiresAt = Date.now() + (Number(body.expires_in) * 1000);
    return cachedToken;
  }
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

async function sheetsRequest(request, path, options = {}) {
  const response = await fetch(`${SHEETS_API}/${spreadsheetId(request)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${await token(request)}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(body?.error?.message || `Google Sheets HTTP ${response.status}`);
  return body;
}

async function readPackageSheet(request) {
  const sheet = await sheetsRequest(request, `?ranges=${encodeURIComponent(SHEET_NAME)}&includeGridData=true`);
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

async function writeRows(request, updates) {
  if (!updates.length) return { totalUpdatedCells: 0, totalUpdatedRows: 0 };
  return sheetsRequest(request, '/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', includeValuesInResponse: false, data: updates }),
  });
}

module.exports = { SHEET_NAME, headers, readPackageSheet, packageRecords, packageKey, comparable, writeRows, spreadsheetId };
