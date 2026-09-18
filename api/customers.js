const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1g2GzzTF214d2-duyuriun-gIGgeHtcxFnXOQO2d4Drg';
const SHEET_GID = process.env.GOOGLE_SHEET_CUSTOMERS_GID || '1539527690';
const HEADERS = ['NO','Nama','Kode Pelanggan','Cabang','Area','Paket Internet','Sales','No KTP','No HP','Email','WhatsApp','Alamat','RT','RW','Desa/Kelurahan','Kecamatan','Kabupaten/Kota','Latitude','Longitude','PPPoE Username','PPPoE Password','ONU Serial','OLT','PON','VLAN','','ODP','Port ODP','Tipe Modem','MAC Address','IP Address','Redaman ONU','Redaman ODP','RX ONT','RX ODP','Speedtest Download','Speedtest Upload','Ping (ms)','Jitter (ms)','Catatan Test','Tanggal Bergabung','Hari Tagihan','Status','Masa Aktif'];

function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); }
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
function value(row, i) { return row[i] == null ? '' : String(row[i]).trim(); }
function csvEscape(value) { const s = value == null ? '' : String(value); return /[",\n\r]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }
function parseCsv(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for (let i=0;i<text.length;i++) { const c=text[i];
    if (quoted && c==='"' && text[i+1]==='"') { cell+='"'; i++; continue; }
    if (c==='"') { quoted=!quoted; continue; }
    if (!quoted && (c===',' || c==='\t')) { row.push(cell); cell=''; continue; }
    if (!quoted && (c==='\n' || c==='\r')) { if (c==='\r' && text[i+1]==='\n') i++; row.push(cell); if (row.some(v=>v.trim())) rows.push(row); row=[]; cell=''; continue; }
    cell+=c;
  }
  if (cell || row.length) { row.push(cell); if (row.some(v=>v.trim())) rows.push(row); }
  return rows;
}
function cleanNumber(s, min, max) { const n=Number(String(s||'').replace(',','.')); return Number.isFinite(n) && n>=min && n<=max ? n : null; }
function cleanInt(s) { const n=Number.parseInt(String(s||''),10); return Number.isFinite(n) ? n : null; }
function dateOrNull(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s||'')) ? s : null; }
function toRecord(row, rowNumber) {
  const name=value(row,1); if (!name) return null;
  return { source_no:cleanInt(value(row,0)), name, customer_code:value(row,2)||null, branch_code:value(row,3)||null, area_code:value(row,4)||null, package_name:value(row,5)||null, sales_name:value(row,6)||null, national_id:value(row,7)||null, phone:value(row,8)||null, email:value(row,9)||null, whatsapp:value(row,10)||null, address:value(row,11)||null, rt:value(row,12)||null, rw:value(row,13)||null, village:value(row,14)||null, district:value(row,15)||null, city_regency:value(row,16)||null, latitude:cleanNumber(value(row,17),-90,90), longitude:cleanNumber(value(row,18),-180,180), join_date:dateOrNull(value(row,40)), billing_day:cleanInt(value(row,41)), status:value(row,42)||null, active_period:value(row,43)||null, _source_row_number:rowNumber, _raw_record:Object.fromEntries(HEADERS.map((h,i)=>[h||`column_${i+1}`,value(row,i)])) };
}
async function sb(path, options={}) { const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...(options.headers||{}) }}); const text=await r.text(); let body; try { body=JSON.parse(text); } catch { body=text; } if(!r.ok) throw new Error(body?.message || body?.hint || `Supabase HTTP ${r.status}`); return body; }
async function listCustomers() { return sb('customers?select=id,source_no,name,customer_code,branch_code,area_code,package_name,sales_name,national_id,phone,email,whatsapp,address,rt,rw,village,district,city_regency,latitude,longitude,join_date,billing_day,status,active_period,customer_network(pppoe_username,pppoe_password,onu_serial,olt,pon,vlan,odp_code,odp_port,modem_type,mac_address,ip_address,onu_attenuation,odp_attenuation,rx_ont,rx_odp)&order=source_no.asc&limit=1000'); }
function dbRowsToSheetRows(customers) {
  return customers.map((customer) => {
    const network = Array.isArray(customer.customer_network) ? (customer.customer_network[0] || {}) : (customer.customer_network || {});
    const row = Array(HEADERS.length).fill('');
    const values = { 0:customer.source_no, 1:customer.name, 2:customer.customer_code, 3:customer.branch_code, 4:customer.area_code, 5:customer.package_name, 6:customer.sales_name, 7:customer.national_id, 8:customer.phone, 9:customer.email, 10:customer.whatsapp, 11:customer.address, 12:customer.rt, 13:customer.rw, 14:customer.village, 15:customer.district, 16:customer.city_regency, 17:customer.latitude, 18:customer.longitude, 19:network.pppoe_username, 20:network.pppoe_password, 21:network.onu_serial, 22:network.olt, 23:network.pon, 24:network.vlan, 26:network.odp_code, 27:network.odp_port, 28:network.modem_type, 29:network.mac_address, 30:network.ip_address, 31:network.onu_attenuation, 32:network.odp_attenuation, 33:network.rx_ont, 34:network.rx_odp, 40:customer.join_date, 41:customer.billing_day, 42:customer.status, 43:customer.active_period };
    Object.entries(values).forEach(([index, value]) => { row[Number(index)] = value == null ? '' : String(value); });
    return row;
  });
}
async function importRows(rows) { let inserted=0, updated=0, skipped=0, errors=[]; for(let i=0;i<rows.length;i++) { const rec=toRecord(rows[i],i+2); if(!rec){ skipped++; continue; } delete rec._source_row_number; delete rec._raw_record; try { const existing=rec.customer_code ? await sb(`customers?select=id&customer_code=eq.${encodeURIComponent(rec.customer_code)}&limit=1`) : []; if(existing[0]) { await sb(`customers?id=eq.${existing[0].id}`,{method:'PATCH',body:JSON.stringify(rec)}); updated++; } else { await sb('customers',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rec)}); inserted++; } } catch(e) { errors.push({row:i+2,error:e.message}); } } return {inserted,updated,skipped,errors}; }
async function googleRows() { const r=await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`); if(!r.ok) throw new Error('Google Sheet tidak dapat diakses. Pastikan sheet dapat dibaca oleh akun/server.'); return parseCsv(await r.text()).slice(1); }
module.exports = async function(req,res) {
  if (!getSession(req)) return json(res,401,{error:'Belum login'});
  if(req.method==='GET') { try { const customers=await listCustomers(); const dbSheetRows = dbRowsToSheetRows(customers); if (req.query?.format === 'csv') { const rows=[HEADERS,...dbSheetRows]; res.statusCode=200; res.setHeader('Content-Type','text/csv; charset=utf-8'); res.setHeader('Content-Disposition','attachment; filename="pelanggan-wangonnet.csv"'); return res.end(rows.map(r=>r.map(csvEscape).join(',')).join('\r\n')); } const sheetRows = await googleRows().catch(() => null); const safeSheetRows = sheetRows ? sheetRows.map((row) => row.map((value, index) => index === 20 ? (value ? '••••••' : '') : value)) : dbSheetRows.map((row) => row.map((value, index) => index === 20 ? (value ? '••••••' : '') : value)); return json(res,200,{customers,count:customers.length,headers:HEADERS,sheetRows:safeSheetRows}); } catch(e) { return json(res,500,{error:e.message}); } }
  if(req.method!=='POST') return json(res,405,{error:'Method tidak diizinkan'});
  try { const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{}); let rows=body.rows; if(body.action==='google-import') rows=await googleRows(); if(!Array.isArray(rows)) return json(res,400,{error:'Data baris import tidak valid'}); const result=await importRows(rows); return json(res,200,{ok:true,...result}); } catch(e) { return json(res,500,{error:e.message}); }
};
module.exports.HEADERS=HEADERS;
module.exports.csvEscape=csvEscape;
