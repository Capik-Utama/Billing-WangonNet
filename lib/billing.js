'use strict';

const text = (value) => String(value ?? '').trim();
const number = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

function packageFor(name, packageRecord) {
  const record = packageRecord || {};
  return {
    code: text(record.package_code),
    name: text(record.package_name || name),
    price: number(record.price),
    profile: text(record.mikrotik_profile_name),
    downloadMbps: number(record.download_max_limit_mbps),
  };
}

function billingFor(packageInfo, billingDay) {
  return {
    amount: packageInfo.price,
    discount: 0,
    admin_fee: 0,
    paid_amount: 0,
    remaining_amount: packageInfo.price,
    payment_status: packageInfo.price === 0 ? 'free' : 'unpaid',
    billing_day: billingDay,
  };
}

function customerFromRecord(record, index, packageRecord) {
  const network = Array.isArray(record.customer_network) ? (record.customer_network[0] || {}) : (record.customer_network || {});
  const packageInfo = packageFor(record.package_name, packageRecord);
  const billingDay = Math.max(1, Math.min(31, number(record.billing_day) || 1));
  const customerCode = text(record.customer_code) || text(record.branch_code) + '-' + String(number(record.source_no) || index).padStart(4, '0');
  return {
    source_no: number(record.source_no) || index,
    name: text(record.name), customer_code: customerCode,
    branch_code: text(record.branch_code), area_code: text(record.area_code), package_name: text(record.package_name), package: packageInfo,
    phone: text(record.phone), whatsapp: text(record.whatsapp), address: text(record.address),
    latitude: number(record.latitude) || null, longitude: number(record.longitude) || null,
    pppoe_username: text(network.pppoe_username), onu_serial: text(network.onu_serial),
    olt: text(network.olt), pon: text(network.pon), odp_name: '', odp_code: text(network.odp_code), odp_port: text(network.odp_port),
    modem_type: text(network.modem_type), mac_address: text(network.mac_address), ip_address: text(network.ip_address),
    join_date: record.join_date || '', billing_day: billingDay, status: text(record.status) || 'active', active_period: text(record.active_period),
    billing: billingFor(packageInfo, billingDay), source_row: number(record.source_no) || index + 1,
    source_formulas: { olt: '', pon: '', odp_code: '', odp_port: '' },
  };
}

function summarize(customers) {
  const active = customers.filter((customer) => ['active', 'aktif', 'online'].includes(customer.status.toLowerCase()));
  const unpaid = customers.filter((customer) => customer.billing.payment_status === 'unpaid');
  const paid = customers.filter((customer) => ['paid', 'lunas'].includes(customer.billing.payment_status));
  const packageCount = new Set(customers.map((customer) => customer.package_name).filter(Boolean)).size;
  const odpCount = new Set(customers.map((customer) => customer.odp_code).filter(Boolean)).size;
  return { total: customers.length, active: active.length, inactive: customers.length - active.length, unpaid: unpaid.length, paid: paid.length, revenue: customers.reduce((sum, customer) => sum + customer.billing.paid_amount, 0), receivable: customers.reduce((sum, customer) => sum + customer.billing.remaining_amount, 0), packageCount, odpCount };
}

function buildBillingFromRecords(records = [], packageRecords = []) {
  const packages = new Map(packageRecords.map((record) => [text(record.package_name).toLowerCase(), record]));
  const customers = records.filter((record) => text(record.name)).map((record, index) => customerFromRecord(record, index + 1, packages.get(text(record.package_name).toLowerCase())));
  return { source: { database: 'Supabase', tables: ['customers', 'customer_network', 'internet_packages'] }, customers, summary: summarize(customers) };
}

module.exports = { buildBillingFromRecords };
