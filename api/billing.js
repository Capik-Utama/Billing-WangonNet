'use strict';
const { buildBilling } = require('../lib/billing');

function parseCsv(input) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index], next = input[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && next === '\n') index += 1; row.push(cell); if (row.some((value) => value !== '')) rows.push(row); row = []; cell = ''; continue; }
    cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function spreadsheetCustomers() {
  const sheetId = process.env.GOOGLE_SHEET_ID || '1g2GzzTF214d2-duyuriun-gIGgeHtcxFnXOQO2d4Drg';
  const gid = process.env.GOOGLE_SHEET_CUSTOMERS_GID || '1539527690';
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`);
  if (!response.ok) throw new Error(`Spreadsheet pelanggan tidak dapat diakses (${response.status})`);
  return parseCsv(await response.text());
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method tidak diizinkan' })); }
  try {
    const billing = buildBilling(await spreadsheetCustomers());
    const url = new URL(req.url, 'http://localhost');
    const customerCode = url.searchParams.get('customer');
    if (customerCode) {
      const customer = billing.customers.find((item) => item.customer_code === customerCode);
      if (!customer) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Pelanggan tidak ditemukan' })); }
      return res.end(JSON.stringify({ customer, invoice: { invoice_number: `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-${customer.source_no}`, ...customer.billing } }));
    }
    return res.end(JSON.stringify(billing));
  } catch (error) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: error.message }));
  }
};
