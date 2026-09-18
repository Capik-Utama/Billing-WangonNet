'use strict';
const crypto = require('crypto');

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1g2GzzTF214d2-duyuriun-gIGgeHtcxFnXOQO2d4Drg';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const SYNC_SECRET = process.env.SYNC_SECRET;
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function send(res, status, body) { res.statusCode = status; Object.entries(JSON_HEADERS).forEach(([key, value]) => res.setHeader(key, value)); res.end(JSON.stringify(body)); }
function bodyOf(req) { return typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}); }
function validSignature(req, body) {
  if (!SYNC_SECRET) return false;
  const received = req.headers['x-sync-signature'] || req.headers['X-Sync-Signature'];
  if (!received) return false;
  const expected = crypto.createHmac('sha256', SYNC_SECRET).update(body).digest('hex');
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Konfigurasi Supabase sinkronisasi belum lengkap');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation', ...(options.headers || {}) } });
  const text = await response.text(); let result; try { result = JSON.parse(text); } catch { result = text; }
  if (!response.ok) throw new Error(result?.message || result?.hint || `Supabase HTTP ${response.status}`);
  return result;
}
const value = (row, index) => row?.[index] ?? '';
const number = (value) => { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; };
const clean = (value) => value === '' || value == null ? null : value;
const raw = (headers, row) => Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, value(row, index)]));

function customerRecord(headers, row, rowNumber) {
  const r = raw(headers, row);
  return { source_no: number(value(row, 0)) || rowNumber, name: String(value(row, 1)), customer_code: clean(value(row, 2)) || `SRC-${rowNumber}`, branch_code: clean(value(row, 3)), area_code: clean(value(row, 4)), package_name: clean(value(row, 5)), sales_name: clean(value(row, 6)), national_id: clean(value(row, 7)), phone: clean(value(row, 8)), email: clean(value(row, 9)), whatsapp: clean(value(row, 10)), address: clean(value(row, 11)), rt: clean(value(row, 12)), rw: clean(value(row, 13)), village: clean(value(row, 14)), district: clean(value(row, 15)), city_regency: clean(value(row, 16)), latitude: number(value(row, 17)), longitude: number(value(row, 18)), join_date: clean(value(row, 40)), billing_day: number(value(row, 41)), status: clean(value(row, 42)) || 'active', active_period: clean(value(row, 43)), raw_record: { ...r, _sync: { origin: 'spreadsheet', sheet_id: SHEET_ID, row_number: rowNumber, synced_at: new Date().toISOString() } } };
}
function networkRecord(headers, row) { return { pppoe_username: clean(value(row, 19)), pppoe_password: clean(value(row, 20)), onu_serial: clean(value(row, 21)), olt: null, pon: null, vlan: clean(value(row, 24)), odp_code: null, odp_port: null, modem_type: clean(value(row, 28)), mac_address: clean(value(row, 29)), ip_address: clean(value(row, 30)), raw_record: raw(headers, row) }; }
function packageRecord(headers, row) { return { branch_code: clean(value(row, 0)), package_code: String(value(row, 1)), package_name: clean(value(row, 2)), price: number(value(row, 3)) || 0, mikrotik_profile_name: clean(value(row, 4)), upload_max_limit_mbps: number(value(row, 5)), upload_burst_limit_mbps: number(value(row, 6)), upload_burst_threshold_mbps: number(value(row, 7)), upload_burst_time_seconds: number(value(row, 8)), download_max_limit_mbps: number(value(row, 9)), download_burst_limit_mbps: number(value(row, 10)), download_burst_threshold_mbps: number(value(row, 11)), download_burst_time_seconds: number(value(row, 12)), raw_record: raw(headers, row) }; }
function areaRecord(headers, row) { return { area_code: String(value(row, 0)), area_name: clean(value(row, 1)), branch_code: clean(value(row, 2)), area_abbreviation: clean(value(row, 3)), raw_record: raw(headers, row) }; }
function odpRecord(headers, row) { return { odp_name: clean(value(row, 0)), area_code: clean(value(row, 2)), capacity: number(value(row, 3)), used_ports: number(value(row, 4)) || 0, latitude: number(value(row, 5)), longitude: number(value(row, 6)), odp_code: clean(value(row, 7)), location_code: clean(value(row, 8)), location_name: clean(value(row, 9)), raw_record: raw(headers, row) }; }
function pppoeRecord(headers, row) { return { pppoe_username: clean(value(row, 0)), pppoe_password: clean(value(row, 1)), profile: clean(value(row, 2)), ip_address: clean(value(row, 3)), comment: clean(value(row, 4)), customer_name: clean(value(row, 5)), generated_username: clean(value(row, 6)), generated_password: clean(value(row, 7)), generated_ip: clean(value(row, 8)), is_enabled: String(value(row, 9)).toLowerCase() !== 'false', raw_record: raw(headers, row) }; }

async function upsertSource(sheet, headers, row, rowNumber) {
  const batch = await sb('data_import_batches', { method: 'POST', body: JSON.stringify({ spreadsheet_id: SHEET_ID, source_title: '5067 sync', status: 'running', notes: `two-way sync ${sheet}` }) });
  const batchId = batch[0]?.id;
  const source = await sb('source_sheet_rows?on_conflict=spreadsheet_id,sheet_name,source_row_number', { method: 'POST', body: JSON.stringify({ spreadsheet_id: SHEET_ID, batch_id: batchId, sheet_name: sheet, source_row_number: rowNumber, row_data: raw(headers, row) }) });
  const sourceId = source[0]?.id;
  if (sheet === 'pelanggan') {
    const customer = customerRecord(headers, row, rowNumber); customer.source_row_id = sourceId;
    const saved = await sb('customers?on_conflict=customer_code', { method: 'POST', body: JSON.stringify(customer) });
    const id = saved[0]?.id;
    if (id) await sb('customer_network?on_conflict=customer_id', { method: 'POST', body: JSON.stringify({ ...networkRecord(headers, row), customer_id: id }) });
  } else if (sheet === 'Paket') await sb('internet_packages?on_conflict=branch_code,package_code', { method: 'POST', body: JSON.stringify({ ...packageRecord(headers, row), source_row_id: sourceId }) });
  else if (sheet === 'Area') await sb('areas?on_conflict=area_code', { method: 'POST', body: JSON.stringify({ ...areaRecord(headers, row), source_row_id: sourceId }) });
  else if (sheet === 'ODP') await sb('odps?on_conflict=odp_code', { method: 'POST', body: JSON.stringify({ ...odpRecord(headers, row), source_row_id: sourceId }) });
  else if (sheet === 'Sheet8') await sb('pppoe_configs?on_conflict=pppoe_username', { method: 'POST', body: JSON.stringify({ ...pppoeRecord(headers, row), source_row_id: sourceId }) });
  await sb(`data_import_batches?id=eq.${batchId}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', notes: `synced ${sheet} row ${rowNumber}` }) });
  return { sourceId, batchId };
}

module.exports = async function handler(req, res) {
  const body = bodyOf(req);
  if (!validSignature(req, body)) return send(res, 401, { error: 'Signature sinkronisasi tidak valid' });
  try {
    if (req.method === 'POST') {
      const payload = JSON.parse(body); if (payload.spreadsheet_id && payload.spreadsheet_id !== SHEET_ID) return send(res, 400, { error: 'Spreadsheet tidak cocok' });
      const rows = Array.isArray(payload.rows) ? payload.rows : [{ row: payload.row, row_number: payload.row_number }];
      const results = []; for (const item of rows) results.push(await upsertSource(payload.sheet, payload.headers || [], item.row || [], item.row_number || 1));
      return send(res, 200, { ok: true, direction: 'spreadsheet_to_billing', processed: results.length, results });
    }
    if (req.method === 'GET') {
      const url = new URL(req.url, 'https://billing.local'); const since = url.searchParams.get('since') || '1970-01-01T00:00:00Z';
      const customers = await sb(`customers?updated_at=gt.${encodeURIComponent(since)}&select=id,source_no,name,customer_code,branch_code,area_code,package_name,sales_name,national_id,phone,email,whatsapp,address,rt,rw,village,district,city_regency,latitude,longitude,join_date,billing_day,status,active_period,raw_record,updated_at&order=updated_at.asc&limit=500`, { method: 'GET' });
      return send(res, 200, { ok: true, direction: 'billing_to_spreadsheet', spreadsheet_id: SHEET_ID, since, customers });
    }
    return send(res, 405, { error: 'Method tidak diizinkan' });
  } catch (error) { return send(res, 500, { error: error.message }); }
};
module.exports._test = { customerRecord, packageRecord, areaRecord, odpRecord, pppoeRecord };
