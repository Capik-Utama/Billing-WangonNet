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

async function packageRecords() {
  return supabase('internet_packages?select=package_code,package_name,price,mikrotik_profile_name,download_max_limit_mbps&order=package_name.asc&limit=1000');
}

function monthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function paymentCategory(record) {
  const relation = Array.isArray(record.payment_types) ? (record.payment_types[0] || {}) : (record.payment_types || {});
  return String(relation.category || '').trim().toLowerCase();
}

function classifyPayment(category) {
  const normalized = String(category || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = normalized ? normalized.split(/\s+/) : [];
  if (['pemasukan', 'income', 'pendapatan'].includes(normalized) || tokens.some((token) => ['pemasukan', 'income', 'pendapatan', 'bayar', 'pelunasan', 'tagihan'].includes(token))) return 'revenue';
  if (['pengeluaran', 'expense', 'outgoing'].includes(normalized) || tokens.some((token) => ['pengeluaran', 'expense', 'beban', 'operasional', 'outgoing'].includes(token))) return 'expense';
  return 'unknown';
}

function summarizeMonthlyFinance(records = []) {
  return records.reduce((summary, record) => {
    const amount = Number(record.amount) || 0;
    if (amount === 0) return summary;
    const kind = classifyPayment(paymentCategory(record));
    if (kind === 'expense') summary.expense += amount;
    if (kind === 'revenue') summary.revenue += amount;
    return summary;
  }, { revenue: 0, expense: 0 });
}

async function monthlyFinanceRecords(now = new Date()) {
  const { start, end } = monthRange(now);
  const select = 'id,amount,paid_at,payment_types(category)';
  const baseFilters = `select=${encodeURIComponent(select)}&paid_at=gte.${start.toISOString()}&paid_at=lt.${end.toISOString()}&order=paid_at.asc.nullslast,id.asc`;
  const pageSize = 1000;
  const records = [];
  let lastPaidAt = null;
  let lastId = null;
  for (;;) {
    const cursor = lastPaidAt && lastId ? `&or=(paid_at.gt.${encodeURIComponent(lastPaidAt)},and(paid_at.eq.${encodeURIComponent(lastPaidAt)},id.gt.${encodeURIComponent(lastId)}))` : '';
    const batch = await supabase(`payments?${baseFilters}&limit=${pageSize}${cursor}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    records.push(...batch);
    if (batch.length < pageSize) break;
    const lastRecord = batch[batch.length - 1];
    lastPaidAt = String(lastRecord.paid_at || '').trim();
    lastId = String(lastRecord.id || '').trim();
    if (!lastPaidAt || !lastId) break;
  }
  return records;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method tidak diizinkan' })); }
  try {
    const [records, packages, payments] = await Promise.all([billingRecords(), packageRecords(), monthlyFinanceRecords()]);
    const billing = buildBillingFromRecords(records, packages);
    const finance = summarizeMonthlyFinance(payments);
    billing.summary = { ...billing.summary, revenue: finance.revenue, expense: finance.expense };
    billing.source.tables = [...new Set([...(billing.source.tables || []), 'payments', 'payment_types'])];
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

module.exports._test = { billingRecords, monthRange, classifyPayment, summarizeMonthlyFinance, monthlyFinanceRecords };
