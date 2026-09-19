const fs = require('node:fs');
const assert = require('node:assert/strict');
const workbook = require('./api/workbook');
const html = fs.readFileSync('./index.html', 'utf8');

assert.equal(typeof workbook, 'function');
assert.deepEqual(workbook._test.resetTables.slice(0, 3), ['payments', 'invoices', 'notifications']);
assert.ok(workbook._test.resetTables.includes('customers'));
assert.ok(!workbook._test.resetTables.includes('app_users'));
assert.match(html, /id="deleteAllDataButton"/);
assert.match(html, /id="deleteAllDataPassword"[^>]*type="password"/);
assert.match(html, /method:'DELETE'/);
assert.match(fs.readFileSync('./api/workbook.js', 'utf8'), /verifyDeveloperPassword/);
console.log('delete-all-data feature checks: OK');
