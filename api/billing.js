'use strict';
const { buildBillingFromRecords } = require('../lib/billing');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

async function supabase(path) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Konfigurasi Supabase billing belum lengkap');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(body?.message || body?.hint || `Supabase HTTP ${response.status}`);
  return body;
}

async function billingRecords() {
  const select = [
    'source_no,name,customer_code,branch_code,area_code,package_name,phone,whatsapp,address,latitude,longitude,join_date,billing_day,status,active_period,raw_record',
    'customer_network(pppoe_username,onu_serial,olt,pon,odp_code,odp_port,modem_type,mac_address,ip_address)',
  ].join(',');
  return supabase(`customers?select=${encodeURIComponent(select)}&order=source_no.asc&limit=1000`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method tidak diizinkan' })); }
  try {
    const billing = buildBillingFromRecords(await billingRecords());
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

module.exports._test = { billingRecords };
