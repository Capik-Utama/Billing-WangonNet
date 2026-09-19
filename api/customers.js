const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getSession(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => {
    const index = item.indexOf('=');
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1).trim())];
  }));
  const token = cookies.billing_session;
  if (!token || !process.env.AUTH_SECRET) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(body).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? session : null;
  } catch { return null; }
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Konfigurasi Supabase belum lengkap');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(body?.message || body?.hint || `Supabase HTTP ${response.status}`);
  return body;
}

async function listCustomers() {
  return supabase('customers?select=id,source_no,name,customer_code,branch_code,area_code,package_name,sales_name,national_id,phone,email,whatsapp,address,rt,rw,village,district,city_regency,latitude,longitude,join_date,billing_day,status,active_period,customer_network(pppoe_username,pppoe_password,onu_serial,olt,pon,vlan,odp_code,odp_port,modem_type,mac_address,ip_address,onu_attenuation,odp_attenuation,rx_ont,rx_odp)&order=source_no.asc&limit=1000');
}

const customerFields = ['source_no','name','customer_code','branch_code','area_code','package_name','sales_name','national_id','phone','email','whatsapp','address','rt','rw','village','district','city_regency','latitude','longitude','join_date','billing_day','status','active_period'];
const networkFields = ['pppoe_username','pppoe_password','onu_serial','olt','pon','vlan','odp_code','odp_port','modem_type','mac_address','ip_address','onu_attenuation','odp_attenuation','rx_ont','rx_odp'];
const pickFields = (value, fields) => Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(value || {}, field)).map((field) => [field, value[field] === '' ? null : value[field]]));

async function updateCustomer(payload) {
  const customer = payload.customer || {};
  const network = payload.network || {};
  if (!customer.id) throw new Error('ID pelanggan tidak ditemukan');
  if (!String(customer.name || '').trim()) throw new Error('Nama pelanggan wajib diisi');
  const customerData = pickFields(customer, customerFields);
  customerData.name = String(customerData.name).trim();
  await supabase(`customers?id=eq.${encodeURIComponent(customer.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(customerData) });
  if (Object.keys(network).length) await supabase('customer_network?on_conflict=customer_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ customer_id: customer.id, ...pickFields(network, networkFields) }]) });
  return { ok: true, message: 'Perubahan pelanggan berhasil disimpan.' };
}

async function createCustomer(payload) {
  const customer = payload.customer || {};
  const network = payload.network || {};
  if (!String(customer.name || '').trim()) throw new Error('Nama pelanggan wajib diisi');
  const customerData = pickFields(customer, customerFields);
  customerData.name = String(customerData.name).trim();
  if (!customerData.status) customerData.status = 'Aktif';
  if (!customerData.join_date) customerData.join_date = new Date().toISOString().slice(0, 10);
  if (customerData.source_no == null || customerData.source_no === '') {
    const latest = await supabase('customers?select=source_no&source_no=not.is.null&order=source_no.desc&limit=1');
    customerData.source_no = Number(latest?.[0]?.source_no || 0) + 1;
  } else customerData.source_no = Number(customerData.source_no);
  if (!customerData.customer_code) customerData.customer_code = `5067-${String(customerData.source_no).padStart(4, '0')}`;
  const created = await supabase('customers', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([customerData]) });
  const customerId = created?.[0]?.id;
  if (customerId && Object.keys(network).length) await supabase('customer_network?on_conflict=customer_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ customer_id: customerId, ...pickFields(network, networkFields) }]) });
  return { ok: true, message: 'Data pelanggan berhasil ditambahkan ke Supabase.', customer: created?.[0] || customerData };
}

module.exports = async function handler(req, res) {
  if (!getSession(req)) return json(res, 401, { error: 'Belum login' });
  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      return json(res, 201, await createCustomer(payload));
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method === 'PATCH') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      return json(res, 200, await updateCustomer(payload));
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method tidak diizinkan' });
  try {
    const customers = await listCustomers();
    if (req.query?.format === 'csv') {
      const headers = ['NO', 'Nama', 'Kode Pelanggan', 'Cabang', 'Area', 'Paket Internet', 'No HP', 'Email', 'Alamat', 'Status'];
      const rows = customers.map((customer) => [customer.source_no, customer.name, customer.customer_code, customer.branch_code, customer.area_code, customer.package_name, customer.phone, customer.email, customer.address, customer.status]);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pelanggan-wangonnet.csv"');
      return res.end([headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n'));
    }
    return json(res, 200, { customers, count: customers.length });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
