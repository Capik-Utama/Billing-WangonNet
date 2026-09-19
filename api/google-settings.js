'use strict';
const { getSession } = require('./session');

function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(body)); }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => { const i = item.indexOf('='); return [item.slice(0, i).trim(), decodeURIComponent(item.slice(i + 1).trim())]; })); }
function extractId(value) { const text = String(value || '').trim(); const match = text.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return match ? match[1] : (/^[a-zA-Z0-9-_]{20,}$/.test(text) ? text : null); }
module.exports = async function handler(req, res) {
  if (!getSession(req)) return json(res, 401, { error: 'Belum login' });
  const jar = cookies(req);
  if (req.method === 'GET') return json(res, 200, { targetUrl: jar.google_sheet_target_url || '', spreadsheetId: jar.google_sheet_target_id || process.env.GOOGLE_SHEET_ID || null });
  if (req.method !== 'POST') return json(res, 405, { error: 'Method tidak diizinkan' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); const id = extractId(body.targetUrl || body.spreadsheetId);
  if (!id) return json(res, 400, { error: 'Vul link atau ID Google Spreadsheet yang valid.' });
  const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  res.setHeader('Set-Cookie', [`google_sheet_target_id=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`, `google_sheet_target_url=${encodeURIComponent(url)}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`]);
  return json(res, 200, { ok: true, targetUrl: url, spreadsheetId: id });
};
