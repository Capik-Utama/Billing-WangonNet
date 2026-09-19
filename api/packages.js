'use strict';

const { getSession } = require('./session');
const { headers, readPackageSheet, packageRecords, packageKey, comparable, writeRows, spreadsheetId } = require('../lib/package-sheet');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.end(JSON.stringify(body)); }
async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Konfigurasi Supabase belum lengkap.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(body?.message || body?.hint || `Supabase HTTP ${response.status}`);
  return body;
}
async function dbPackages() {
  return sb('internet_packages?select=id,branch_code,package_code,package_name,price,mikrotik_profile_name,upload_max_limit_mbps,upload_burst_limit_mbps,upload_burst_threshold_mbps,upload_burst_time_seconds,download_max_limit_mbps,download_burst_limit_mbps,download_burst_threshold_mbps,download_burst_time_seconds&order=branch_code.asc,package_code.asc&limit=1000');
}
function sheetRow(record) {
  return [record.branch_code ?? '', record.package_code ?? '', record.package_name ?? '', record.price ?? 0, record.mikrotik_profile_name ?? '', record.upload_max_limit_mbps ?? '', record.upload_burst_limit_mbps ?? '', record.upload_burst_threshold_mbps ?? '', record.upload_burst_time_seconds ?? '', record.download_max_limit_mbps ?? '', record.download_burst_limit_mbps ?? '', record.download_burst_threshold_mbps ?? '', record.download_burst_time_seconds ?? ''];
}
function cleanForDb(record) { const copy = { ...record }; delete copy.source_row_number; return copy; }
function diffRows(sheetRecords, databaseRecords) {
  const dbByKey = new Map(databaseRecords.map((record) => [packageKey(record), record]));
  const seen = new Set(); const changes = { inserted: [], updated: [], skipped: [], errors: [] };
  for (const record of sheetRecords) {
    const key = packageKey(record); if (!record.package_code || seen.has(key)) { changes.skipped.push({ row: record.source_row_number, reason: seen.has(key) ? 'Kode paket duplikat' : 'Kode paket kosong' }); continue; }
    seen.add(key); const existing = dbByKey.get(key);
    if (!existing) changes.inserted.push(record);
    else if (comparable(cleanForDb(existing)) !== comparable(cleanForDb(record))) changes.updated.push({ before: existing, after: record });
  }
  return changes;
}
async function importPackages(sheetRecords) {
  const current = await dbPackages(); const changes = diffRows(sheetRecords, current); let inserted = 0; let updated = 0; const errors = [];
  for (const record of changes.inserted) { try { await sb('internet_packages', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cleanForDb(record)) }); inserted++; } catch (error) { errors.push({ row: record.source_row_number, error: error.message }); } }
  for (const change of changes.updated) { try { await sb(`internet_packages?branch_code=eq.${encodeURIComponent(change.after.branch_code)}&package_code=eq.${encodeURIComponent(change.after.package_code)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cleanForDb(change.after)) }); updated++; } catch (error) { errors.push({ row: change.after.source_row_number, error: error.message }); } }
  return { inserted, updated, skipped: changes.skipped.length, errors };
}
async function exportPackages(req) {
  const [sheet, database] = await Promise.all([readPackageSheet(req), dbPackages()]);
  const formulaColumns = new Set(sheet.formulaColumns); const sheetRows = packageRecords(sheet.rows); const dbByKey = new Map(database.map((record) => [packageKey(record), record]));
  const updates = []; const seen = new Set(); let updated = 0; let appended = 0;
  for (let i = 0; i < sheetRows.length; i++) {
    const source = sheetRows[i]; const record = dbByKey.get(packageKey(source)); if (!record) continue;
    const next = sheet.rows[source.source_row_number - 1]?.slice() || Array(13).fill(''); const incoming = sheetRow(record);
    for (let column = 0; column < 13; column++) if (!formulaColumns.has(column) && String(next[column] ?? '') !== String(incoming[column] ?? '')) { next[column] = incoming[column]; }
    if (JSON.stringify(next) !== JSON.stringify(sheet.rows[source.source_row_number - 1] || [])) { updates.push({ range: `${encodeURIComponent('Paket')}!A${source.source_row_number}:M${source.source_row_number}`, values: [next] }); updated++; }
    seen.add(packageKey(source));
  }
  const nextRow = Math.max(3, sheet.rows.length + 1);
  for (const record of database) if (!seen.has(packageKey(record))) { const rowNumber = nextRow + appended; const values = sheetRow(record).map((value, column) => formulaColumns.has(column) ? '' : value); updates.push({ range: `${encodeURIComponent('Paket')}!A${rowNumber}:M${rowNumber}`, values: [values] }); appended++; }
  const result = await writeRows(req, updates); return { updated, appended, skippedFormulaColumns: [...formulaColumns], totalUpdatedCells: result.totalUpdatedCells || 0 };
}

module.exports = async function handler(req, res) {
  if (!getSession(req)) return json(res, 401, { error: 'Belum login' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (req.method === 'GET') { const [sheet, database] = await Promise.all([readPackageSheet(req), dbPackages()]); return json(res, 200, { spreadsheetId: spreadsheetId(req), headers, sheet, packages: database, changes: diffRows(packageRecords(sheet.rows), database) }); }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method tidak diizinkan' });
    const sheet = await readPackageSheet(req);
    if (body.action === 'preview-import') return json(res, 200, { ...diffRows(packageRecords(sheet.rows), await dbPackages()), formulaColumns: sheet.formulaColumns });
    if (body.action === 'import') return json(res, 200, { ok: true, ...(await importPackages(packageRecords(sheet.rows))) });
    if (body.action === 'export') return json(res, 200, { ok: true, ...(await exportPackages(req)) });
    return json(res, 400, { error: 'Aksi Paket tidak dikenal' });
  } catch (error) { return json(res, 500, { error: error.message }); }
};
