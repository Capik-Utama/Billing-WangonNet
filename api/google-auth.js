'use strict';
const crypto = require('crypto');
const { getSession } = require('./session');

function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(body)); }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => { const i = item.indexOf('='); return [item.slice(0, i).trim(), decodeURIComponent(item.slice(i + 1).trim())]; })); }
function sign(value) { return crypto.createHmac('sha256', process.env.AUTH_SECRET || 'missing-secret').update(value).digest('base64url'); }
function configured() { return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI && process.env.AUTH_SECRET); }
function clearCookie(name) { return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
function configError() { return 'Login Google belum dikonfigurasi. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, dan AUTH_SECRET pada deployment.'; }

module.exports = async function handler(req, res) {
  if (!getSession(req)) return json(res, 401, { error: 'Belum login' });
  const url = new URL(req.url, 'http://localhost'); const action = url.searchParams.get('action') || 'status'; const jar = cookies(req);
  if (action === 'status') return json(res, 200, { configured: configured(), connected: Boolean(jar.google_refresh_token), email: jar.google_account_email || null });
  if (action === 'start') {
    if (!configured()) return json(res, 503, { error: configError() });
    const state = crypto.randomBytes(24).toString('base64url'); const stateValue = `${state}.${sign(state)}`;
    const params = new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID, redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: 'openid email https://www.googleapis.com/auth/spreadsheets', state });
    res.setHeader('Set-Cookie', `google_oauth_state=${stateValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`); res.statusCode = 302; res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params}`); return res.end();
  }
  if (action === 'callback') {
    const state = url.searchParams.get('state'); const stateCookie = jar.google_oauth_state || ''; const [savedState, savedSignature] = stateCookie.split('.');
    if (!state || state !== savedState || sign(state) !== savedSignature) return json(res, 400, { error: 'State OAuth Google tidak valid atau sudah kedaluwarsa.' });
    const code = url.searchParams.get('code'); if (!code) return json(res, 400, { error: 'Kode OAuth Google tidak tersedia.' });
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_OAUTH_CLIENT_ID, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI, grant_type: 'authorization_code' }) });
    const tokenBody = await tokenResponse.json(); if (!tokenResponse.ok || !tokenBody.refresh_token) return json(res, 502, { error: tokenBody.error_description || 'Google tidak mengembalikan refresh token.' });
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokenBody.access_token}` } }); const profile = await profileResponse.json();
    res.setHeader('Set-Cookie', [`google_refresh_token=${encodeURIComponent(tokenBody.refresh_token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`, `google_account_email=${encodeURIComponent(profile.email || '')}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`, clearCookie('google_oauth_state')]); res.statusCode = 302; res.setHeader('Location', '/#akun'); return res.end();
  }
  if (action === 'disconnect') { res.setHeader('Set-Cookie', [clearCookie('google_refresh_token'), clearCookie('google_account_email')]); return json(res, 200, { ok: true }); }
  return json(res, 400, { error: 'Aksi Google tidak dikenal.' });
};
