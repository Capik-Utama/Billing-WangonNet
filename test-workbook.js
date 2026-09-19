const assert = require('node:assert/strict');
const { parseNumeric, mapRows } = require('./api/workbook')._test;

assert.equal(parseNumeric('-7.633.714.399.293.010'), -7633714399293010);
assert.equal(parseNumeric('Rp 150.000'), 150000);
assert.equal(parseNumeric('1.234,56'), 1234.56);
assert.equal(parseNumeric('-7,633714'), -7.633714);
assert.equal(parseNumeric(''), null);

const [row] = mapRows('customers', {
  rows: [{ Nama: 'Pelanggan Uji', 'Kode Pelanggan': 'C-1', Latitude: '-7.633.714.399.293.010', 'Redaman ONU': '-7.633.714.399.293.010', 'Hari Tagihan': '15' }]
});
assert.equal(row.latitude, null);
assert.equal(row.billing_day, 15);
assert.equal(row._network.onu_attenuation, -7633714399293010);
assert.equal(row.raw_record.Latitude, '-7.633.714.399.293.010');
assert.equal(row._network.raw_record['Redaman ONU'], '-7.633.714.399.293.010');
console.log('workbook import numeric tests: OK');
