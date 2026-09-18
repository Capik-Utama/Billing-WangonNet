'use strict';

const snapshot = require('../data/spreadsheet-tabs.json');

const valueOf = (cell) => cell && typeof cell === 'object' ? (cell.value ?? '') : (cell ?? '');
const formulaOf = (cell) => cell && typeof cell === 'object' ? (cell.formula || '') : '';
const rowsOf = (name) => (snapshot[name]?.rows || []).map((row) => row.map(valueOf));
const rawRowsOf = (name) => snapshot[name]?.rows || [];
const text = (value) => String(value ?? '').trim();
const number = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const packages = rowsOf('Paket').slice(2).filter((row) => text(row[1]));
const packageByName = new Map(packages.map((row) => [text(row[2]).toLowerCase(), row]));
const odps = rowsOf('ODP').slice(1).filter((row) => text(row[0]));
const odpByName = new Map(odps.map((row) => [text(row[0]), row]));
const headers = rowsOf('pelanggan')[0] || [];

function parseOdpFormula(odpName, seenCount) {
  const source = text(odpName);
  const match = source.match(/\((\d+)\.(\d+)\.(\d+)\)/);
  const odp = odpByName.get(source);
  const capacity = number(odp?.[3]);
  return {
    olt: match ? `5067 HSGQ (${match[1]})` : '',
    pon: match ? number(match[3]) : '',
    odpCode: odp ? text(odp[7]) : '',
    odpPort: source ? (capacity && seenCount <= capacity ? seenCount : (capacity ? 'Penuh' : '')) : '',
    capacity,
  };
}

function packageFor(name) {
  const row = packageByName.get(text(name).toLowerCase());
  if (!row) return { code: '', name: text(name), price: 0, profile: '' };
  return { code: text(row[1]), name: text(row[2]), price: number(row[3]), profile: text(row[4]), downloadMbps: number(row[9]) };
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

function customerFromRow(row, index) {
  const packageInfo = packageFor(row[5]);
  const odpName = text(row[25]) && !String(row[25]).startsWith('=') ? row[25] : row[26];
  const formula = parseOdpFormula(odpName, index);
  const billingDay = Math.max(1, Math.min(31, number(row[41]) || 1));
  return {
    source_no: number(row[0]) || index,
    name: text(row[1]), customer_code: text(row[2]) || `${text(row[3])}-${String(number(row[0]) || index).padStart(4, '0')}`,
    branch_code: text(row[3]), area_code: text(row[4]), package_name: text(row[5]), package: packageInfo,
    phone: text(row[8]), whatsapp: text(row[10]), address: text(row[11]),
    latitude: number(row[17]) || null, longitude: number(row[18]) || null,
    pppoe_username: text(row[19]), onu_serial: text(row[21]), olt: formula.olt || text(row[22]), pon: formula.pon || text(row[23]),
    odp_name: text(odpName), odp_code: formula.odpCode, odp_port: formula.odpPort, modem_type: text(row[28]), mac_address: text(row[29]), ip_address: text(row[30]),
    join_date: row[40] || '', billing_day: billingDay, status: text(row[42]) || 'active', active_period: text(row[43]),
    billing: billingFor(packageInfo, billingDay),
    source_row: index + 1,
    source_formulas: { olt: formulaOf(rawRowsOf('pelanggan')[index]?.[22]), pon: formulaOf(rawRowsOf('pelanggan')[index]?.[23]), odp_code: formulaOf(rawRowsOf('pelanggan')[index]?.[27]), odp_port: formulaOf(rawRowsOf('pelanggan')[index]?.[28]) },
  };
}

function customerFromRecord(record, index) {
  const raw = record.raw_record || {};
  const network = record.customer_network || {};
  const odpName = text(raw.column_26 || raw.odp_label || raw.ODP_LABEL || network.odp_name);
  const formula = parseOdpFormula(odpName, index);
  const packageInfo = packageFor(record.package_name);
  const billingDay = Math.max(1, Math.min(31, number(record.billing_day) || 1));
  return {
    source_no: number(record.source_no) || index,
    name: text(record.name), customer_code: text(record.customer_code) || `${text(record.branch_code)}-${String(number(record.source_no) || index).padStart(4, '0')}`,
    branch_code: text(record.branch_code), area_code: text(record.area_code), package_name: text(record.package_name), package: packageInfo,
    phone: text(record.phone), whatsapp: text(record.whatsapp), address: text(record.address),
    latitude: number(record.latitude) || null, longitude: number(record.longitude) || null,
    pppoe_username: text(network.pppoe_username || raw['PPPoE Username']), onu_serial: text(network.onu_serial || raw['ONU Serial']),
    olt: formula.olt || text(network.olt || raw.OLT), pon: formula.pon || text(network.pon || raw.PON),
    odp_name: odpName || text(raw.ODP), odp_code: text(network.odp_code) || formula.odpCode || text(raw.ODP), odp_port: text(network.odp_port || raw['Port ODP']) || formula.odpPort,
    modem_type: text(network.modem_type || raw['Tipe Modem']), mac_address: text(network.mac_address || raw['MAC Address']), ip_address: text(network.ip_address || raw['IP Address']),
    join_date: record.join_date || raw['Tanggal Bergabung'] || '', billing_day: billingDay, status: text(record.status) || 'active', active_period: text(record.active_period),
    billing: billingFor(packageInfo, billingDay),
    source_row: number(record.source_no) || index + 1,
    source_formulas: { olt: '', pon: '', odp_code: '', odp_port: '' },
  };
}

function summarize(customers) {
  const active = customers.filter((customer) => ['active', 'aktif', 'online'].includes(customer.status.toLowerCase()));
  const unpaid = customers.filter((customer) => customer.billing.payment_status === 'unpaid');
  const paid = customers.filter((customer) => ['paid', 'lunas'].includes(customer.billing.payment_status));
  return { total: customers.length, active: active.length, inactive: customers.length - active.length, unpaid: unpaid.length, paid: paid.length, revenue: customers.reduce((sum, customer) => sum + customer.billing.paid_amount, 0), receivable: customers.reduce((sum, customer) => sum + customer.billing.remaining_amount, 0), packageCount: packages.length, odpCount: odps.length };
}

function buildBilling(customerRows = rowsOf('pelanggan')) {
  const source = customerRows.slice(1).filter((row) => text(row[1]));
  const customers = source.map((row, index) => customerFromRow(row, index + 1));
  return { source: { spreadsheet: '5067', tabs: Object.keys(snapshot), formulas: ['OLT/PON parsing', 'ODP VLOOKUP', 'ODP capacity COUNTIF', 'package price lookup'] }, customers, summary: summarize(customers) };
}

function buildBillingFromRecords(records = []) {
  const customers = records.filter((record) => text(record.name)).map((record, index) => customerFromRecord(record, index + 1));
  return { source: { spreadsheet: '5067', tabs: ['Paket', 'Area', 'ODP', 'pelanggan', 'Sheet8'], formulas: ['OLT/PON parsing', 'ODP VLOOKUP', 'ODP capacity COUNTIF', 'package price lookup'], storage: 'Supabase customer records' }, customers, summary: summarize(customers) };
}

module.exports = { buildBilling, buildBillingFromRecords, headers, valueOf, formulaOf };
