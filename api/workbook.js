const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getSession(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => {
    const i = item.indexOf('=');
    return [item.slice(0, i).trim(), decodeURIComponent(item.slice(i + 1).trim())];
  }));
  const token = cookies.billing_session;
  if (!token || !process.env.AUTH_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? session : null;
  } catch { return null; }
}

function requireRole(req, res, roles) {
  const session = getSession(req);
  if (!session) return null;
  if (!roles.includes(session.role)) {
    json(res, 403, { error: 'Aksi ini hanya tersedia untuk role: ' + roles.join(', ') });
    return null;
  }
  return session;
}

async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Konfigurasi Supabase belum lengkap');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(body?.message || body?.hint || `Supabase HTTP ${response.status}`);
  return body;
}

const exportTables = {
  areas: 'id,area_code,area_name,area_abbreviation,branch_code',
  odps: 'id,odp_code,odp_name,area_code,capacity,used_ports,latitude,longitude,location_code,location_name',
  packages: 'id,branch_code,package_code,package_name,price,mikrotik_profile_name,upload_max_limit_mbps,upload_burst_limit_mbps,upload_burst_threshold_mbps,upload_burst_time_seconds,download_max_limit_mbps,download_burst_limit_mbps,download_burst_threshold_mbps,download_burst_time_seconds',
  customers: 'id,source_no,name,customer_code,branch_code,area_code,package_name,sales_name,national_id,phone,email,whatsapp,address,rt,rw,village,district,city_regency,latitude,longitude,join_date,billing_day,status,active_period',
  network: 'customer_id,pppoe_username,pppoe_password,onu_serial,olt,pon,vlan,odp_code,odp_port,modem_type,mac_address,ip_address,onu_attenuation,odp_attenuation,rx_ont,rx_odp'
};

async function getTable(table, select) {
  return supabase(`${table}?select=${encodeURIComponent(select)}&order=id.asc&limit=10000`);
}

const aliases = {
  value(row, ...names) {
    for (const name of names) {
      if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') return row[name];
    }
    return null;
  },
  key(value) { return String(value ?? '').trim(); }
};

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    out[String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] = value;
  }
  return out;
}

// Spreadsheet Indonesia sering mengirim angka seperti "-7.633.714.399.293.010".
// Number() tidak memahami pemisah ribuan titik dan nilai mentahnya dapat membuat
// PostgreSQL mencoba meng-cast string tersebut ke numeric.
function parseNumeric(value, { integer = false } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? (integer ? Math.trunc(value) : value) : null;

  let text = String(value).trim().replace(/\s/g, '').replace(/^Rp\.?/i, '').replace(/[()]/g, '');
  let negative = false;
  if (text.startsWith('-')) { negative = true; text = text.slice(1); }
  else if (text.startsWith('+')) text = text.slice(1);
  if (!text || !/^[0-9.,]+$/.test(text)) return null;

  const dots = (text.match(/\./g) || []).length;
  const commas = (text.match(/,/g) || []).length;
  if (dots && commas) {
    const decimalSeparator = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
    text = text.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
  } else if (dots > 1) {
    text = text.replaceAll('.', '');
  } else if (dots === 1 && /^\d{1,3}\.\d{3}$/.test(text)) {
    text = text.replace('.', '');
  } else if (commas > 1) {
    text = text.replaceAll(',', '');
  } else if (commas === 1) {
    text = text.replace(',', '.');
  }

  const parsed = Number(`${negative ? '-' : ''}${text}`);
  return Number.isFinite(parsed) ? (integer ? Math.trunc(parsed) : parsed) : null;
}

function parseDbNumeric(value, options = {}) {
  const parsed = parseNumeric(value, options);
  if (parsed === null || (options.maxAbs !== undefined && Math.abs(parsed) > options.maxAbs)) return null;
  return parsed;
}

function classify(sheet) {
  const rows = sheet.rows || [];
  const sample = normalizeRow(rows[0] || {});
  const keys = Object.keys(sample).join('|');
  if (String(sheet.name || '').trim().toLowerCase() === 'sheet8' || sheet.index === 7) return 'sheet_8_ignored';
  if (keys.includes('kode_paket') || keys.includes('nama_paket') || keys.includes('mikrotik_profile')) return 'packages';
  if (keys.includes('kode_cabang') && keys.includes('nama')) return 'areas';
  if (keys.includes('kapasitas') || keys.includes('capacity') || (keys.includes('latitude') && keys.includes('longitude') && (keys.includes('kode_odp') || keys.includes('odp_code')))) return 'odps';
  if (keys.includes('kode_pelanggan') || keys.includes('paket_internet') || keys.includes('pppoe_username')) return 'customers';
  return 'unsupported';
}

function mapRows(type, sheet) {
  return (sheet.rows || []).map((raw) => {
    const r = normalizeRow(raw);
    if (type === 'packages') return {
      raw_record: raw,
      branch_code: aliases.value(r, 'kode_cabang', 'cabang') || '5067',
      package_code: aliases.value(r, 'kode_paket', 'kode'),
      package_name: aliases.value(r, 'nama_paket', 'nama'),
      price: parseDbNumeric(aliases.value(r, 'harga', 'price'), { maxAbs: 999999999999.99 }) ?? 0,
      mikrotik_profile_name: aliases.value(r, 'profile_name_mikrotik', 'profil_mikrotik', 'mikrotik_profile_name', 'profile_name'),
      upload_max_limit_mbps: parseNumeric(aliases.value(r, 'upload_max_limit', 'upload_max_limit_mbps')) ?? 0,
      upload_burst_limit_mbps: parseNumeric(aliases.value(r, 'upload_burst_limit', 'upload_burst_limit_mbps')) ?? 0,
      upload_burst_threshold_mbps: parseNumeric(aliases.value(r, 'upload_burst_threshold', 'upload_burst_threshold_mbps')) ?? 0,
      upload_burst_time_seconds: parseNumeric(aliases.value(r, 'upload_burst_time', 'upload_burst_time_seconds')) ?? 0,
      download_max_limit_mbps: parseNumeric(aliases.value(r, 'download_max_limit', 'download_max_limit_mbps')) ?? 0,
      download_burst_limit_mbps: parseNumeric(aliases.value(r, 'download_burst_limit', 'download_burst_limit_mbps')) ?? 0,
      download_burst_threshold_mbps: parseNumeric(aliases.value(r, 'download_burst_threshold', 'download_burst_threshold_mbps')) ?? 0,
      download_burst_time_seconds: parseNumeric(aliases.value(r, 'download_burst_time', 'download_burst_time_seconds')) ?? 0
    };
    if (type === 'areas') return { raw_record: raw, area_code: aliases.value(r, 'kode', 'area_kode', 'area_code'), area_name: aliases.value(r, 'nama', 'nama_area', 'area_name'), area_abbreviation: aliases.value(r, 'singkatan', 'area_abbreviation', 'kolom_4'), branch_code: aliases.value(r, 'kode_cabang', 'branch_code') || '5067' };
    if (type === 'odps') return {
      raw_record: raw,
      odp_code: aliases.value(r, 'kode', 'kode_odp', 'odp_code'), odp_name: aliases.value(r, 'nama', 'nama_odp', 'odp_name'), area_code: aliases.value(r, 'area_kode', 'area_code', 'kode_area'),
      capacity: parseNumeric(aliases.value(r, 'kapasitas', 'capacity'), { integer: true }) ?? 0,
      used_ports: parseNumeric(aliases.value(r, 'terpakai', 'used_ports', 'port_terpakai'), { integer: true }) ?? 0,
      latitude: parseDbNumeric(aliases.value(r, 'latitude'), { maxAbs: 90 }), longitude: parseDbNumeric(aliases.value(r, 'longitude'), { maxAbs: 180 }),
      location_code: aliases.value(r, 'kode_lokasi', 'location_code', 'kolom_1'), location_name: aliases.value(r, 'nama_lokasi', 'location_name', 'nama')
    };
    const no = parseNumeric(aliases.value(r, 'no', 'source_no'), { integer: true }) ?? 0;
    return {
      raw_record: raw, source_no: no, name: aliases.value(r, 'nama', 'name'), customer_code: aliases.value(r, 'kode_pelanggan', 'customer_code') || (no > 0 ? `5067-${String(no).padStart(4, '0')}` : null), branch_code: aliases.value(r, 'cabang', 'kode_cabang', 'branch_code') || '5067', area_code: aliases.value(r, 'area', 'area_code', 'kode_area'), package_name: aliases.value(r, 'paket_internet', 'package_name', 'paket'), sales_name: aliases.value(r, 'sales', 'sales_name'), national_id: aliases.value(r, 'no_ktp', 'national_id'), phone: aliases.value(r, 'no_hp', 'phone'), email: aliases.value(r, 'email'), whatsapp: aliases.value(r, 'whatsapp'), address: aliases.value(r, 'alamat', 'address'), rt: aliases.value(r, 'rt'), rw: aliases.value(r, 'rw'), village: aliases.value(r, 'desa_kelurahan', 'village'), district: aliases.value(r, 'kecamatan', 'district'), city_regency: aliases.value(r, 'kabupaten_kota', 'city_regency'), latitude: parseDbNumeric(aliases.value(r, 'latitude'), { maxAbs: 90 }), longitude: parseDbNumeric(aliases.value(r, 'longitude'), { maxAbs: 180 }), join_date: aliases.value(r, 'tanggal_bergabung', 'join_date'), billing_day: parseNumeric(aliases.value(r, 'hari_tagihan', 'billing_day'), { integer: true }) ?? 0, status: aliases.value(r, 'status'), active_period: aliases.value(r, 'masa_aktif', 'active_period'),
      _network: { raw_record: raw, pppoe_username: aliases.value(r, 'pppoe_username', 'pppoe_usename'), pppoe_password: aliases.value(r, 'pppoe_password'), onu_serial: aliases.value(r, 'onu_serial'), olt: aliases.value(r, 'olt'), pon: aliases.value(r, 'pon'), vlan: aliases.value(r, 'vlan'), odp_code: aliases.value(r, 'odp', 'odp_code'), odp_port: aliases.value(r, 'port_odp', 'odp_port'), modem_type: aliases.value(r, 'tipe_modem', 'modem_type'), mac_address: aliases.value(r, 'mac_address'), ip_address: aliases.value(r, 'ip_address'), onu_attenuation: parseNumeric(aliases.value(r, 'redaman_onu', 'onu_attenuation')), odp_attenuation: parseNumeric(aliases.value(r, 'redaman_odp', 'odp_attenuation')), rx_ont: parseNumeric(aliases.value(r, 'rx_ont')), rx_odp: parseNumeric(aliases.value(r, 'rx_odp')) }
    };
  });
}

async function upsert(table, rows, onConflict) {
  const clean = rows.filter(Boolean);
  const result = [];
  for (let i = 0; i < clean.length; i += 250) {
    const chunk = clean.slice(i, i + 250);
    const body = await supabase(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(chunk) });
    result.push(...(Array.isArray(body) ? body : []));
  }
  return result;
}

const resetTables = [
  'payments', 'invoices', 'notifications', 'member_cards', 'customer_speed_tests',
  'customer_network', 'customers', 'pppoe_configs', 'odps', 'internet_packages',
  'areas', 'branches', 'source_sheet_rows', 'data_import_batches', 'payment_accounts',
  'payment_types', 'notification_templates', 'company_settings'
];

async function deleteAllOperationalData() {
  for (const table of resetTables) await supabase(`${table}?id=not.is.null`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

async function verifyDeveloperPassword(session, password) {
  if (!SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) return false;
  const response = await fetch(new URL('/rest/v1/rpc/verify_app_user', SUPABASE_URL), {
    method: 'POST',
    body: JSON.stringify({ p_username: String(session.username), p_password: String(password) }),
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json' }
  });
  if (!response.ok) return false;
  const user = await response.json();
  return Boolean(user && user.id === session.sub && user.role === 'developer');
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (!requireRole(req, res, ['developer', 'admin'])) return;
      const data = {};
      for (const [key, select] of Object.entries(exportTables)) data[key] = await getTable(key === 'packages' ? 'internet_packages' : key === 'network' ? 'customer_network' : key, select);
      return json(res, 200, { generated_at: new Date().toISOString(), data });
    }
    if (req.method === 'DELETE') {
      const session = requireRole(req, res, ['developer']);
      if (!session) return;
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (!payload.password) return json(res, 400, { error: 'Password login wajib diisi sebelum menghapus data.' });
      if (!(await verifyDeveloperPassword(session, payload.password))) return json(res, 401, { error: 'Password login salah. Tidak ada data yang dihapus.' });
      await deleteAllOperationalData();
      return json(res, 200, { ok: true, message: 'Semua data operasional berhasil dihapus. Akun pengguna tetap dipertahankan.' });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method tidak diizinkan' });
    if (!requireRole(req, res, ['developer'])) return;
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];
    const report = { ignored_sheet_8: 0, unsupported: [], packages: 0, areas: 0, odps: 0, customers: 0, network: 0 };
    const grouped = { packages: [], areas: [], odps: [], customers: [] };
    for (const sheet of sheets) {
      const type = classify(sheet);
      if (type === 'sheet_8_ignored') { report.ignored_sheet_8 += (sheet.rows || []).length; continue; }
      if (type === 'unsupported') { report.unsupported.push({ index: sheet.index, name: sheet.name, rows: (sheet.rows || []).length }); continue; }
      grouped[type].push(...mapRows(type, sheet));
    }
    const valid = { packages: grouped.packages.filter((r) => r.package_code), areas: grouped.areas.filter((r) => r.area_code), odps: grouped.odps.filter((r) => r.odp_code), customers: grouped.customers.filter((r) => r.name || r.customer_code) };
    await upsert('areas', valid.areas, 'area_code'); report.areas = valid.areas.length;
    await upsert('odps', valid.odps, 'odp_code'); report.odps = valid.odps.length;
    await upsert('internet_packages', valid.packages, 'branch_code,package_code'); report.packages = valid.packages.length;
    const customerRows = valid.customers.map(({ _network, ...customer }) => customer);
    const saved = await upsert('customers', customerRows, 'customer_code'); report.customers = valid.customers.length;
    const idByCode = new Map(saved.filter((row) => row.customer_code).map((row) => [row.customer_code, row.id]));
    const networks = valid.customers.map((row) => { const customer_id = idByCode.get(row.customer_code); return customer_id ? { customer_id, ...row._network } : null; }).filter(Boolean);
    if (networks.length) { await upsert('customer_network', networks, 'customer_id'); report.network = networks.length; }
    return json(res, 200, { ok: true, report, message: 'Import selesai. Sheet ke-8 dilewati sesuai permintaan.' });
  } catch (error) { return json(res, 500, { error: error.message }); }
};

module.exports._test = { normalizeRow, classify, mapRows, parseNumeric, resetTables };
