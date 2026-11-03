'use strict';
const nodemailer = require('nodemailer');

/* ---------------- Correo (Gmail) ----------------
   1) API de Gmail por HTTPS (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN): funciona en Render gratis, que bloquea SMTP.
   2) SMTP con contraseña de aplicación (GMAIL_APP_PASSWORD): para tu PC o hostings que dejan usar SMTP.
   3) Sin nada: los correos solo se imprimen en la consola. */
const { GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
const USE_API = !!(GMAIL_USER && GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN);
const MAIL_OK = USE_API || !!(GMAIL_USER && GMAIL_APP_PASSWORD);
const transport = USE_API ? nodemailer.createTransport({ streamTransport: true, buffer: true })
  : MAIL_OK ? nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 })
  : null;
if (!MAIL_OK) console.warn('[correo] Falta configurar Gmail (GMAIL_USER y GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN, o GMAIL_APP_PASSWORD): los correos solo se imprimen en esta consola.');

let gToken = { v: '', exp: 0 };
async function gmailToken() {
  if (gToken.v && Date.now() < gToken.exp - 60e3) return gToken.v;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(10000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google rechazó el token (' + r.status + ' ' + (j.error || '') + ' ' + (j.error_description || '') + ')');
  gToken = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return gToken.v;
}
async function sendViaGmailApi(msg) {
  const raw = (await transport.sendMail(msg)).message.toString('base64url');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + await gmailToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }), signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) { gToken = { v: '', exp: 0 }; throw new Error('Gmail API ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 300)); }
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, bodyHtml) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#16181D">' +
    '<div style="background:#16181D;color:#F2B705;padding:14px 18px;border-radius:12px 12px 0 0;font-weight:800;font-size:18px">VIP Ruta Segura</div>' +
    '<div style="border:1px solid #E1E4E9;border-top:0;padding:18px;border-radius:0 0 12px 12px">' +
    '<h2 style="margin:0 0 10px;font-size:18px">' + esc(title) + '</h2>' + bodyHtml +
    '<p style="color:#757B87;font-size:12px;margin-top:18px">Trujillo ⇄ Chiclayo · Si no fuiste tú, ignora este mensaje.</p></div></div>';
}

// No lanza: un correo fallido nunca debe romper la operación principal.
async function sendMail(to, subject, title, html, text) {
  const body = layout(title, html);
  if (!transport) { console.log('[correo→' + to + '] ' + subject + '\n' + (text || title)); return false; }
  try {
    const msg = { from: '"VIP Ruta Segura" <' + GMAIL_USER + '>', to, subject, html: body, text: text || title };
    if (USE_API) await sendViaGmailApi(msg); else await transport.sendMail(msg);
    return true;
  } catch (e) { console.error('[correo] no se pudo enviar a ' + to + ': ' + e.message); return false; }
}

/* ---------------- Validación de DNI (apis.net.pe, solo desde el servidor) ---------------- */
const DNI_URL = process.env.APIS_NET_PE_URL || 'https://api.apis.net.pe/v2/reniec/dni';

async function lookupDni(dni) {
  const token = process.env.APIS_NET_PE_TOKEN;
  if (!token) { const e = new Error('La validación de DNI no está configurada (falta APIS_NET_PE_TOKEN).'); e.status = 503; e.expose = true; throw e; }
  let r;
  try {
    r = await fetch(DNI_URL + '?numero=' + encodeURIComponent(dni), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  } catch (_) { const e = new Error('No pudimos consultar el DNI ahora. Inténtalo en un momento.'); e.status = 502; e.expose = true; throw e; }
  if (r.status === 404 || r.status === 422) { const e = new Error('No encontramos ese DNI. Revisa el número.'); e.status = 404; e.expose = true; throw e; }
  if (!r.ok) { console.error('[dni] respuesta ' + r.status); const e = new Error('No pudimos consultar el DNI ahora. Inténtalo en un momento.'); e.status = 502; e.expose = true; throw e; }
  const j = await r.json().catch(() => ({}));
  const first = String(j.nombres || j.nombre || '').trim();
  const last = [j.apellidoPaterno, j.apellidoMaterno].filter(Boolean).join(' ').trim();
  const name = (j.nombreCompleto && !first ? String(j.nombreCompleto) : (first + ' ' + last)).replace(/\s+/g, ' ').trim();
  if (!name) { const e = new Error('No encontramos ese DNI. Revisa el número.'); e.status = 404; e.expose = true; throw e; }
  return titleCase(name);
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|\s)([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
}

module.exports = { sendMail, lookupDni, esc, MAIL_OK };
