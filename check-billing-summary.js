const assert = require('node:assert/strict');
const billing = require('./api/billing');

const { monthRange, classifyPayment, summarizeMonthlyFinance } = billing._test;

const { start, end } = monthRange(new Date('2026-09-20T16:45:00Z'));
assert.equal(start.toISOString(), '2026-09-01T00:00:00.000Z');
assert.equal(end.toISOString(), '2026-10-01T00:00:00.000Z');

assert.equal(classifyPayment('Pemasukan'), 'revenue');
assert.equal(classifyPayment('pengeluaran operasional'), 'expense');
assert.equal(classifyPayment('Biaya Pemasangan'), 'unknown');
assert.equal(classifyPayment('Pendapatan Payment Gateway'), 'revenue');

assert.deepEqual(
  summarizeMonthlyFinance([
    { amount: '10000', payment_types: { category: 'Pemasukan' } },
    { amount: 7000, payment_types: [{ category: 'Pengeluaran Operasional' }] },
    { amount: 4000, payment_types: { category: 'Biaya Pemasangan' } },
  ]),
  { revenue: 10000, expense: 7000 }
);

console.log('billing summary checks: OK');
