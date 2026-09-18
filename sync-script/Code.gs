const DATA_SHEETS = ['Paket', 'Area', 'ODP', 'pelanggan', 'Sheet8'];
const FORMULA_COLUMNS = { Paket: [], Area: [], ODP: [], pelanggan: [23, 24, 27, 28], Sheet8: [10] };

function syncConfig_() {
  const props = PropertiesService.getScriptProperties();
  return { endpoint: props.getProperty('SYNC_ENDPOINT'), secret: props.getProperty('SYNC_SECRET'), spreadsheetId: SpreadsheetApp.getActive().getId() };
}
function sign_(body, secret) {
  const bytes = Utilities.computeHmacSha256Signature(body, secret);
  return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}
function dataPayload_(sheet, rowNumber) {
  const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  return { spreadsheet_id: SpreadsheetApp.getActive().getId(), sheet: sheet.getName(), row_number: rowNumber, headers: sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0], row: values };
}
function postSync_(payload) {
  const config = syncConfig_();
  if (!config.endpoint || !config.secret) throw new Error('SYNC_ENDPOINT dan SYNC_SECRET belum diatur di Script Properties');
  const body = JSON.stringify(payload);
  return UrlFetchApp.fetch(config.endpoint, { method: 'post', contentType: 'application/json', headers: { 'X-Sync-Signature': sign_(body, config.secret) }, payload: body, muteHttpExceptions: true });
}
function onEditInstallable(e) {
  const range = e && e.range;
  if (!range) return;
  const sheet = range.getSheet();
  if (!DATA_SHEETS.includes(sheet.getName()) || range.getRow() === 1) return;
  const formulaColumns = FORMULA_COLUMNS[sheet.getName()] || [];
  const first = range.getColumn();
  const last = first + range.getNumColumns() - 1;
  if (formulaColumns.some(column => column >= first && column <= last)) return;
  postSync_(dataPayload_(sheet, range.getRow()));
}
function syncAllDataRows() {
  const config = syncConfig_();
  if (!config.endpoint || !config.secret) throw new Error('SYNC_ENDPOINT dan SYNC_SECRET belum diatur di Script Properties');
  const spreadsheet = SpreadsheetApp.getActive();
  DATA_SHEETS.forEach(name => {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    const headers = values.shift();
    values.forEach((row, index) => { if (row.some(value => value !== '')) postSync_({ spreadsheet_id: spreadsheet.getId(), sheet: name, row_number: index + 2, headers, row }); });
  });
}
function syncBillingChanges() {
  const config = syncConfig_();
  if (!config.endpoint || !config.secret) throw new Error('SYNC_ENDPOINT dan SYNC_SECRET belum diatur di Script Properties');
  const since = PropertiesService.getScriptProperties().getProperty('LAST_BILLING_SYNC') || '1970-01-01T00:00:00Z';
  const body = '{}';
  const response = UrlFetchApp.fetch(config.endpoint + '?since=' + encodeURIComponent(since), { method: 'get', headers: { 'X-Sync-Signature': sign_(body, config.secret) }, muteHttpExceptions: true });
  if (response.getResponseCode() >= 300) throw new Error(response.getContentText());
  const payload = JSON.parse(response.getContentText());
  const sheet = SpreadsheetApp.getActive().getSheetByName('pelanggan');
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rowByCode = {};
  values.slice(1).forEach((row, index) => { if (row[2]) rowByCode[String(row[2])] = index + 2; });
  (payload.customers || []).forEach(customer => {
    const rowNumber = rowByCode[String(customer.customer_code)];
    if (!rowNumber) return;
    const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    const updates = { 1: customer.source_no, 2: customer.name, 3: customer.customer_code, 4: customer.branch_code, 5: customer.area_code, 6: customer.package_name, 7: customer.sales_name, 8: customer.national_id, 9: customer.phone, 10: customer.email, 11: customer.whatsapp, 12: customer.address, 13: customer.rt, 14: customer.rw, 15: customer.village, 16: customer.district, 17: customer.city_regency, 18: customer.latitude, 19: customer.longitude, 41: customer.join_date, 42: customer.billing_day, 43: customer.status, 44: customer.active_period };
    Object.keys(updates).forEach(column => { if (!(FORMULA_COLUMNS.pelanggan || []).includes(Number(column))) row[Number(column) - 1] = updates[column] ?? ''; });
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  });
  PropertiesService.getScriptProperties().setProperty('LAST_BILLING_SYNC', new Date().toISOString());
}
function configureSync(endpoint, secret) {
  PropertiesService.getScriptProperties().setProperties({ SYNC_ENDPOINT: endpoint, SYNC_SECRET: secret });
}
