const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_AUTH_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_KEY;

function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); }
function getSession(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => { const i = item.indexOf('='); return [item.slice(0, i).trim(), decodeURIComponent(item.slice(i + 1).trim())]; }));
  const token = cookies.billing_session;
  if (!token || !process.env.AUTH_SECRET) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(body).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return session.exp > Date.now() ? session : null; } catch { return null; }
}
async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Konfigurasi Supabase belum lengkap');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(body?.message || body?.hint || `Supabase HTTP ${response.status}`);
  return body;
}
const resources = {
  odp: { table: 'odps', select: 'id,odp_code,odp_name,area_code,capacity,used_ports,location_name', order: 'odp_code.asc', fields: ['odp_code', 'odp_name', 'area_code', 'capacity', 'used_ports', 'location_name'], required: ['odp_code'] },
  area: { table: 'areas', select: 'id,area_code,area_name,area_abbreviation,branch_code', order: 'area_code.asc', fields: ['area_code', 'area_name', 'area_abbreviation', 'branch_code'], required: ['area_code'] },
  paket: { table: 'internet_packages', select: 'id,branch_code,package_code,package_name,price,mikrotik_profile_name,download_max_limit_mbps,upload_max_limit_mbps', order: 'package_name.asc', fields: ['branch_code', 'package_code', 'package_name', 'price', 'mikrotik_profile_name', 'download_max_limit_mbps', 'upload_max_limit_mbps'], required: ['package_code'] },
};
const pickFields = (value, fields) => Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(value || {}, field)).map((field) => [field, value[field] === '' ? null : value[field]]));
const numberFields = new Set(['capacity', 'used_ports', 'price', 'download_max_limit_mbps', 'upload_max_limit_mbps']);
function normalizePayload(resource, input) {
  const data = pickFields(input, resource.fields);
  for (const field of resource.required) if (!String(data[field] ?? '').trim()) throw new Error(`${field} wajib diisi`);
  for (const field of numberFields) if (Object.prototype.hasOwnProperty.call(data, field)) { data[field] = data[field] === null ? null : Number(data[field]); if (data[field] !== null && !Number.isFinite(data[field])) throw new Error(`${field} harus berupa angka`); }
  return data;
}
async function verifyPassword(session, password) {
  if (!password || !session?.username || !SUPABASE_URL || !SUPABASE_AUTH_KEY) return false;
  const response = await fetch(new URL('/rest/v1/rpc/verify_app_user', SUPABASE_URL), { method: 'POST', body: JSON.stringify({ p_username: String(session.username), p_password: String(password) }), headers: { apikey: SUPABASE_AUTH_KEY, Authorization: `Bearer ${SUPABASE_AUTH_KEY}`, 'Content-Type': 'application/json' } });
  if (!response.ok) return false;
  return Boolean(await response.json());
}
module.exports = async function handler(req, res) {
  const session = getSession(req); if (!session) return json(res, 401, { error: 'Belum login' });
  const type = String(req.query?.type || ''); const resource = resources[type]; if (!resource) return json(res, 400, { error: 'Jenis data tidak valid' });
  try {
    if (req.method === 'GET') {
      const url = `${resource.table}?select=${encodeURIComponent(resource.select)}&order=${encodeURIComponent(resource.order)}&limit=1000`;
      const data = await supabase(url); return json(res, 200, { type, data, count: data.length });
    }
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const id = String(payload.id || '').trim();
    if (req.method === 'POST') {
      const data = normalizePayload(resource, payload.data || {});
      const created = await supabase(resource.table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([data]) });
      return json(res, 201, { ok: true, message: 'Data berhasil ditambahkan.', data: created?.[0] || data });
    }
    if (req.method === 'PATCH') {
      if (!id) return json(res, 400, { error: 'ID data tidak ditemukan' });
      const data = normalizePayload(resource, payload.data || {});
      await supabase(`${resource.table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(data) });
      return json(res, 200, { ok: true, message: 'Perubahan data berhasil disimpan.' });
    }
    if (req.method === 'DELETE') {
      const ids = Array.isArray(payload.ids) ? payload.ids.map((value) => String(value).trim()).filter(Boolean) : (id ? [id] : []);
      if (!ids.length) return json(res, 400, { error: 'ID data tidak ditemukan' });
      if (!payload.password) return json(res, 401, { error: 'Password login wajib diisi untuk menghapus data.' });
      if (!(await verifyPassword(session, payload.password))) return json(res, 403, { error: 'Password login salah.' });
      await supabase(`${resource.table}?id=in.(${ids.map((value) => encodeURIComponent(value)).join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return json(res, 200, { ok: true, message: `${ids.length} data berhasil dihapus.` });
    }
    return json(res, 405, { error: 'Method tidak diizinkan' });
  } catch (error) { return json(res, 400, { error: error.message }); }
};
