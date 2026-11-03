'use strict';
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { q, tx, migrate, pool } = require('./db');
const { sendMail, lookupDni, esc, MAIL_OK } = require('./services');

const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET || (PROD ? '' : 'dev-secret-cambia-esto-en-el-env-0123456789');
if (!SECRET || SECRET.length < 16) { console.error('Falta SESSION_SECRET (16+ caracteres) en el .env'); process.exit(1); }
const APP_URL = (process.env.APP_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/$/, '');

const WAIT_MIN = 20;            // minutos de espera después de la hora de salida
const HOLD_MIN = 10;            // minutos que se guarda un asiento mientras se paga
const SPECIAL = ['07-28', '07-29', '10-31', '11-01', '12-24', '12-25', '12-31', '01-01'];
const OFF = { tru: 'Trujillo', chi: 'Chiclayo' };
const VSEATS = { auto: 4, camioneta: 6, minivan: 8 };
const sol = n => 'S/ ' + Number(n).toFixed(2);

/* ================= utilidades ================= */
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const fail = (status, msg, extra) => { throw new HttpError(status, msg, extra); };
const A = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const S = v => String(v == null ? '' : v);
const isPhone = v => /^9\d{8}$/.test(S(v));
const isYmd = v => /^\d{4}-\d{2}-\d{2}$/.test(S(v)) && !isNaN(Date.parse(S(v) + 'T00:00:00Z'));
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(S(v)) && S(v).length <= 120;
const shortName = n => { const p = S(n).trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[1].charAt(0) + '.' : p[0]; };
const firstName = n => S(n).trim().split(/\s+/)[0] || '';
const bookingCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += c[crypto.randomInt(c.length)]; return 'VIP-' + s; };
const sha = s => crypto.createHash('sha256').update(SECRET + '|' + s).digest('hex');
const fileUrl = id => (id ? '/api/files/' + id : null);

const buckets = new Map();
function limit(key, max, windowMs) {
  const now = Date.now(); const b = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (b.length >= max) { buckets.set(key, b); fail(429, 'Demasiados intentos. Espera unos minutos y vuelve a probar.'); }
  b.push(now); buckets.set(key, b);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (!v.some(t => now - t < 3600e3)) buckets.delete(k); }, 600e3).unref();

/* ----- archivos (data URL -> bytea) ----- */
const MAX_FILE = 4 * 1024 * 1024;
function parseDataUrl(d) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(S(d));
  if (!m) fail(400, 'Archivo no válido.');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_FILE) fail(400, 'El archivo es demasiado grande (máximo 4 MB).');
  const h = buf.subarray(0, 12);
  let mime = null;
  if (h[0] === 0xff && h[1] === 0xd8) mime = 'image/jpeg';
  else if (h.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) mime = 'image/png';
  else if (h.subarray(0, 4).toString() === 'RIFF' && h.subarray(8, 12).toString() === 'WEBP') mime = 'image/webp';
  else if (h.subarray(0, 4).toString() === '%PDF') mime = 'application/pdf';
  if (!mime) fail(400, 'Solo se aceptan fotos (JPG, PNG, WEBP) o PDF.');
  return { mime, buf };
}
async function saveFile(c, ownerId, kind, dataUrl) {
  const { mime, buf } = parseDataUrl(dataUrl);
  const r = await c.query('insert into files (owner_id, kind, mime, data) values ($1,$2,$3,$4) returning id', [ownerId, kind, mime, buf]);
  return r.rows[0].id;
}

/* ----- sesión ----- */
function cookies(req) {
  const o = {}; S(req.headers.cookie).split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function setSession(res, uid, remember) {
  const token = jwt.sign({ uid }, SECRET, { expiresIn: '30d' });
  const parts = ['vip_sid=' + token, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (PROD) parts.push('Secure');
  if (remember) parts.push('Max-Age=' + 30 * 86400);
  res.setHeader('Set-Cookie', parts.join('; '));
}
const clearSession = res => res.setHeader('Set-Cookie', 'vip_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');

async function loadUser(req, res, next) {
  try {
    const t = cookies(req).vip_sid; req.user = null;
    if (t) {
      let p = null; try { p = jwt.verify(t, SECRET); } catch (_) {}
      if (p) {
        const r = await q('select u.*, dp.status as drv_status from users u left join driver_profiles dp on dp.user_id = u.id where u.id = $1', [p.uid]);
        const u = r.rows[0];
        if (u && !u.blocked) req.user = u;
        else if (u && u.blocked) { clearSession(res); req.blocked = u.blocked_reason || true; }
      }
    }
    next();
  } catch (e) { next(e); }
}
const needUser = (req, _res, next) => { if (!req.user) return next(new HttpError(req.blocked ? 403 : 401, req.blocked ? 'Tu cuenta está bloqueada. Contacta a la central VIP.' : 'Inicia sesión para continuar.')); next(); };
const needAdmin = (req, _res, next) => (!req.user || !req.user.is_admin) ? next(new HttpError(403, 'Solo para administradores.')) : next();
const needDriver = (req, _res, next) => (!req.user || !req.user.drv_status) ? next(new HttpError(403, 'Necesitas una cuenta de conductor.')) : next();
const needDriverOrAdmin = (req, _res, next) => (!req.user || !(req.user.drv_status || req.user.is_admin)) ? next(new HttpError(403, 'Solo para conductores.')) : next();
const needApprovedDriver = (req, _res, next) => (!req.user || req.user.drv_status !== 'approved') ? next(new HttpError(403, 'Tu verificación de conductor aún no está aprobada.')) : next();

/* ================= DTOs ================= */
async function meDto(uid) {
  const r = await q('select u.*, dp.* , dp.status as drv_status, dp.review_note as drv_note, u.id as id from users u left join driver_profiles dp on dp.user_id = u.id where u.id = $1', [uid]);
  const u = r.rows[0]; if (!u) return null;
  const rating = (await q('select avg(stars)::float a, count(*)::int n from reviews where driver_id=$1', [uid])).rows[0];
  const dto = {
    id: String(u.id), email: u.email, name: u.name, phone: u.phone, dni: u.dni, isAdmin: u.is_admin,
    emerg: { name: u.emerg_name || '', phone: u.emerg_phone || '' },
    files: { selfie: fileUrl(u.selfie_file_id), dni_photo: fileUrl(u.dni_file_id) },
    pax: { status: u.pax_status, note: u.pax_note },
    driver: null
  };
  if (u.drv_status) {
    dto.driver = {
      status: u.drv_status, note: u.drv_note,
      lic: { num: u.lic_num || '', cat: u.lic_cat, file: fileUrl(u.lic_file_id) },
      veh: { type: u.vtype, model: u.model || '', plate: u.plate || '', color: u.color, ext: fileUrl(u.veh_ext_file_id), int: fileUrl(u.veh_int_file_id), bag: fileUrl(u.veh_bag_file_id) },
      soat: { until: u.soat_until, file: fileUrl(u.soat_file_id) }, rt: u.rt_ok, ant: fileUrl(u.ant_file_id),
      yape: u.yape_phone || '', plin: u.plin_phone || '',
      rating: rating.n ? rating.a : null, reviews: rating.n
    };
  }
  return dto;
}

const TRIP_COLS = `t.id, to_char(t.trip_date,'YYYY-MM-DD') as date, t.dep_time as time, t.from_off as "from", t.price, t.seats, t.vtype,
  t.status, t.dep_at, t.driver_id, t.veh_model, t.veh_plate, t.veh_color,
  (select count(*)::int from booking_seats bs join bookings b on b.id = bs.booking_id
     where bs.trip_id = t.id and bs.active and (b.status in ('por_confirmar','confirmado') or (b.status = 'hold' and b.hold_until > now()))) as taken`;
const tripDto = t => ({
  id: String(t.id), date: t.date, time: t.time, from: t.from, to: t.from === 'tru' ? 'chi' : 'tru', price: t.price, seats: t.seats, vtype: t.vtype,
  status: t.status, dep: t.dep_at instanceof Date ? t.dep_at.toISOString() : t.dep_at, driverId: String(t.driver_id),
  model: t.veh_model, plate: t.veh_plate, color: t.veh_color, taken: t.taken, free: Math.max(0, t.seats - t.taken)
});

async function driversMap(ids) {
  ids = [...new Set(ids.map(Number))].filter(Boolean); const out = {};
  if (!ids.length) return out;
  const r = await q(`select u.id, u.name, u.selfie_file_id, u.created_at, dp.status, dp.lic_cat, dp.vtype, dp.model, dp.plate, dp.color,
      dp.veh_ext_file_id, dp.veh_int_file_id, dp.veh_bag_file_id,
      (select avg(stars)::float from reviews r where r.driver_id = u.id) as rating,
      (select count(*)::int from reviews r where r.driver_id = u.id) as nrev,
      (select count(*)::int from trips t where t.driver_id = u.id and t.status = 'finished') as ntrips
    from users u join driver_profiles dp on dp.user_id = u.id where u.id = any($1)`, [ids]);
  r.rows.forEach(d => {
    const ok = d.status === 'approved';
    out[d.id] = {
      id: String(d.id), name: d.name, verified: ok, lic: d.lic_cat, rating: d.rating, reviews: d.nrev, trips: d.ntrips,
      since: new Date(d.created_at).getFullYear(), photo: ok ? fileUrl(d.selfie_file_id) : null,
      vtype: d.vtype, model: d.model, plate: d.plate, color: d.color,
      photos: ok ? { ext: fileUrl(d.veh_ext_file_id), int: fileUrl(d.veh_int_file_id), bag: fileUrl(d.veh_bag_file_id) } : {}
    };
  });
  return out;
}

/* ================= precios y promociones ================= */
function promoFor(trip, full) {
  const list = [];
  const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(trip.date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
  if (days >= 2) list.push({ name: 'Reserva anticipada', pct: 10 });
  if (SPECIAL.includes(trip.date.slice(5))) list.push({ name: 'Fecha especial', pct: 10 });
  const h = +trip.time.slice(0, 2); if (h >= 10 && h < 15) list.push({ name: 'Horario valle', pct: 10 });
  if (full) list.push({ name: 'Vehículo completo', pct: 15 });
  list.sort((a, b) => b.pct - a.pct); return list[0] || null;
}
async function reprice(c, bookingId) {
  const b = (await c.query('select b.id, b.trip_id from bookings b where b.id = $1', [bookingId])).rows[0];
  const t = (await c.query(`select ${TRIP_COLS} from trips t where t.id = $1`, [b.trip_id])).rows[0];
  const mine = (await c.query('select count(*)::int n from booking_seats where booking_id = $1 and active', [bookingId])).rows[0].n;
  const others = (await c.query(`select count(*)::int n from booking_seats bs join bookings x on x.id = bs.booking_id
     where bs.trip_id = $1 and bs.active and bs.booking_id <> $2 and (x.status in ('por_confirmar','confirmado') or (x.status = 'hold' and x.hold_until > now()))`, [b.trip_id, bookingId])).rows[0].n;
  const full = others === 0 && mine === t.seats;
  const pr = promoFor(t, full); const sub = Math.round(mine * t.price * 100) / 100;
  const total = Math.round(sub * (pr ? 1 - pr.pct / 100 : 1) * 100) / 100;
  await c.query('update bookings set subtotal=$2, promo_name=$3, promo_pct=$4, total=$5 where id=$1', [bookingId, sub, pr ? pr.name : null, pr ? pr.pct : 0, total]);
  return { subtotal: sub, promo: pr, total };
}
const bookingDto = (b, seats) => ({
  id: String(b.id), code: b.code, tripId: String(b.trip_id), status: b.status, holdUntil: b.hold_until, seats: seats || [],
  subtotal: b.subtotal, promo: b.promo_pct ? { name: b.promo_name, pct: b.promo_pct } : null, total: b.total, rated: b.rated
});

/* ================= tareas programadas ================= */
// Libera asientos: reservas sin pagar vencidas y pasajeros que no abordaron a los 20 min.
async function runJobs() {
  await tx(async c => {
    const exp = await c.query(`update bookings set status = 'expirado' where status = 'hold' and hold_until < now() returning id`);
    if (exp.rowCount) await c.query(`update booking_seats set active = false, released_at = now() where booking_id = any($1) and active`, [exp.rows.map(r => r.id)]);

    const late = `t.status = 'active' and t.dep_at + interval '${WAIT_MIN} minutes' < now()`;
    // pagos que nadie confirmó a tiempo
    const stale = await c.query(`select b.id from bookings b join trips t on t.id = b.trip_id where b.status = 'por_confirmar' and ${late}`);
    if (stale.rowCount) {
      const ids = stale.rows.map(r => r.id);
      await c.query(`update bookings set status = 'expirado' where id = any($1)`, [ids]);
      await c.query(`update payments set status = 'rechazado', note = 'No se confirmó antes de la salida', decided_at = now() where booking_id = any($1) and status = 'pendiente'`, [ids]);
      await c.query(`update booking_seats set active = false, released_at = now() where booking_id = any($1) and active`, [ids]);
    }
    // espera de 20 minutos: quien no abordó pierde el asiento
    const rel = await c.query(`update booking_seats bs set active = false, released_at = now(), noshow = true
      from bookings b, trips t where b.id = bs.booking_id and t.id = bs.trip_id and bs.active and bs.boarded_at is null
        and b.status = 'confirmado' and ${late} returning bs.booking_id`);
    if (rel.rowCount) {
      const ids = [...new Set(rel.rows.map(r => r.booking_id))];
      await c.query(`update bookings b set status = 'no_presentado' where b.id = any($1) and not exists (select 1 from booking_seats x where x.booking_id = b.id and x.active)`, [ids]);
    }
  });
}
let lastJob = 0;
const lazyJobs = async () => { if (Date.now() - lastJob > 15000) { lastJob = Date.now(); try { await runJobs(); } catch (e) { console.error('[jobs]', e.message); } } };

/* ================= app ================= */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
app.use(express.json({ limit: '7mb' }));
// Salud del servicio, sin sesión ni tareas programadas: para el hosting y monitores externos.
app.get('/health', A(async (req, res) => { await q('select 1'); res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true, mail: MAIL_OK }); }));
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', A(async (req, res, next) => { await lazyJobs(); next(); }));
app.use('/api', loadUser);
const api = express.Router();
app.use('/api', api);

/* ---------- registro e ingreso ---------- */
// 1) El DNI se valida contra RENIEC (apis.net.pe) desde el servidor y devuelve el nombre oficial.
api.post('/dni', A(async (req, res) => {
  limit('dni|' + req.ip, 20, 3600e3);
  const dni = S(req.body.dni);
  if (!/^\d{8}$/.test(dni)) fail(400, 'El DNI tiene 8 dígitos.');
  if ((await q('select 1 from users where dni = $1', [dni])).rowCount) fail(409, 'Ese DNI ya tiene una cuenta. Ingresa con tu correo.');
  const name = await lookupDni(dni);
  res.json({ name, dniToken: jwt.sign({ p: 'dni', dni, name }, SECRET, { expiresIn: '40m' }) });
}));

// 2) Código de 6 dígitos por correo (Gmail)
api.post('/auth/code', A(async (req, res) => {
  const email = S(req.body.email).trim().toLowerCase();
  if (!isEmail(email)) fail(400, 'Escribe un correo válido.');
  limit('code|' + req.ip, 15, 3600e3);
  if ((await q('select 1 from users where lower(email) = $1', [email])).rowCount) fail(409, 'Ese correo ya tiene una cuenta. Ingresa con tu contraseña.');
  const last = (await q(`select created_at from email_codes where lower(email) = $1 order by created_at desc limit 1`, [email])).rows[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < 45e3) fail(429, 'Espera unos segundos antes de pedir otro código.');
  const n = (await q(`select count(*)::int n from email_codes where lower(email) = $1 and created_at > now() - interval '1 day'`, [email])).rows[0].n;
  if (n >= 10) fail(429, 'Pediste demasiados códigos hoy. Inténtalo mañana.');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const row = (await q(`insert into email_codes (email, code_hash, expires_at) values ($1,$2, now() + interval '10 minutes') returning id`, [email, sha(email + '|' + code)])).rows[0];
  const sent = await sendMail(email, 'Tu código de VIP Ruta Segura: ' + code, 'Verifica tu correo',
    '<p>Tu código es:</p><p style="font-size:32px;letter-spacing:6px;font-weight:800;margin:8px 0">' + code + '</p><p>Vence en 10 minutos.</p>',
    'Tu código de VIP Ruta Segura es ' + code + ' (vence en 10 minutos).');
  if (!sent && MAIL_OK) {
    await q('delete from email_codes where id = $1', [row.id]); // sin código enviado no hay espera de 45 s
    const e = new Error('No pudimos enviar el correo ahora. Inténtalo en un momento.'); e.status = 502; e.expose = true; throw e;
  }
  res.json({ ok: true });
}));

api.post('/auth/verify', A(async (req, res) => {
  const email = S(req.body.email).trim().toLowerCase(), code = S(req.body.code).trim();
  if (!/^\d{6}$/.test(code)) fail(400, 'El código tiene 6 dígitos.');
  limit('verify|' + email, 12, 3600e3);
  const r = (await q(`select * from email_codes where lower(email) = $1 and not used and expires_at > now() order by created_at desc limit 1`, [email])).rows[0];
  if (!r) fail(400, 'El código venció. Pide uno nuevo.');
  if (r.attempts >= 5) fail(429, 'Demasiados intentos con este código. Pide uno nuevo.');
  if (r.code_hash !== sha(email + '|' + code)) { await q('update email_codes set attempts = attempts + 1 where id = $1', [r.id]); fail(400, 'El código no coincide. Revisa tu correo.'); }
  await q('update email_codes set used = true where id = $1', [r.id]);
  res.json({ emailToken: jwt.sign({ p: 'email', email }, SECRET, { expiresIn: '40m' }) });
}));

api.post('/auth/register', A(async (req, res) => {
  limit('reg|' + req.ip, 10, 3600e3);
  const b = req.body; let d, e;
  try { d = jwt.verify(S(b.dniToken), SECRET); e = jwt.verify(S(b.emailToken), SECRET); } catch (_) { fail(400, 'Tu verificación venció. Empieza de nuevo.'); }
  if (d.p !== 'dni' || e.p !== 'email') fail(400, 'Verificación no válida.');
  if (!isPhone(b.phone)) fail(400, 'El celular debe tener 9 dígitos y empezar con 9.');
  if (S(b.password).length < 6) fail(400, 'La contraseña debe tener al menos 6 caracteres.');
  const role = b.role === 'conductor' ? 'conductor' : 'pasajero';
  const hash = await bcrypt.hash(S(b.password), 10);
  let uid;
  try {
    uid = await tx(async c => {
      const u = (await c.query('insert into users (email, dni, name, phone, pass_hash) values ($1,$2,$3,$4,$5) returning id', [e.email, d.dni, d.name, S(b.phone), hash])).rows[0].id;
      if (role === 'conductor') await c.query('insert into driver_profiles (user_id) values ($1)', [u]);
      return u;
    });
  } catch (err) { if (err.code === '23505') fail(409, 'Ese correo o DNI ya tiene una cuenta.'); throw err; }
  setSession(res, uid, b.remember !== false);
  res.json({ me: await meDto(uid) });
}));

api.post('/auth/login', A(async (req, res) => {
  const email = S(req.body.email).trim().toLowerCase();
  limit('login|' + req.ip + '|' + email, 10, 15 * 60e3);
  const u = (await q('select * from users where lower(email) = $1', [email])).rows[0];
  if (!u || !(await bcrypt.compare(S(req.body.password), u.pass_hash))) fail(401, 'El correo o la contraseña no coinciden.');
  if (u.blocked) fail(403, 'Tu cuenta está bloqueada. Contacta a la central VIP.' + (u.blocked_reason ? ' Motivo: ' + u.blocked_reason : ''));
  setSession(res, u.id, req.body.remember !== false);
  res.json({ me: await meDto(u.id) });
}));
api.post('/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

/* ---------- mi cuenta ---------- */
api.get('/me', A(async (req, res) => {
  if (!req.user) return res.json({ me: null, blocked: req.blocked ? (req.blocked === true ? '' : req.blocked) : undefined });
  res.json({ me: await meDto(req.user.id) });
}));

api.put('/me/profile', needUser, A(async (req, res) => {
  const b = req.body, sets = [], vals = [req.user.id];
  const add = (col, v) => { vals.push(v); sets.push(col + ' = $' + vals.length); };
  if (b.phone !== undefined) { if (!isPhone(b.phone)) fail(400, 'El celular debe tener 9 dígitos y empezar con 9.'); add('phone', S(b.phone)); }
  if (b.emerg) {
    const n = S(b.emerg.name).trim().slice(0, 60);
    if (n.length < 2) fail(400, 'Escribe el nombre de tu contacto.');
    if (!isPhone(b.emerg.phone)) fail(400, 'El celular de tu contacto debe tener 9 dígitos y empezar con 9.');
    add('emerg_name', n); add('emerg_phone', S(b.emerg.phone));
  }
  if (sets.length) await q('update users set ' + sets.join(', ') + ' where id = $1', vals);
  res.json({ me: await meDto(req.user.id) });
}));

api.post('/me/driver', needUser, A(async (req, res) => {
  await q('insert into driver_profiles (user_id) values ($1) on conflict do nothing', [req.user.id]);
  res.json({ me: await meDto(req.user.id) });
}));

const VEH_RE = /^[A-Z0-9]{3}-\d{3}$/;
api.put('/me/driver', needUser, needDriver, A(async (req, res) => {
  const b = req.body; const cur = (await q('select * from driver_profiles where user_id = $1', [req.user.id])).rows[0];
  const next = {}; const sets = [], vals = [req.user.id];
  const set = (col, v) => { next[col] = v; vals.push(v); sets.push(col + ' = $' + vals.length); };
  if (b.lic_num !== undefined) { const v = S(b.lic_num).toUpperCase().trim(); if (!/^[A-Z]\d{8}$/.test(v)) fail(400, 'La licencia tiene una letra y 8 dígitos. Ej. Q12345678.'); set('lic_num', v); }
  if (b.lic_cat !== undefined) { if (!['A-I', 'A-IIa', 'A-IIb', 'A-IIIa', 'A-IIIb', 'A-IIIc'].includes(b.lic_cat)) fail(400, 'Categoría no válida.'); if (b.lic_cat === 'A-I') fail(400, 'Para transportar pasajeros necesitas categoría A-IIa o superior.'); set('lic_cat', b.lic_cat); }
  if (b.vtype !== undefined) { if (!VSEATS[b.vtype]) fail(400, 'Tipo de vehículo no válido.'); set('vtype', b.vtype); }
  if (b.model !== undefined) { const v = S(b.model).trim().slice(0, 50); if (v.length < 3) fail(400, 'Escribe la marca y el modelo.'); set('model', v); }
  if (b.plate !== undefined) { const v = S(b.plate).toUpperCase().trim(); if (!VEH_RE.test(v)) fail(400, 'La placa va así: ABC-123.'); set('plate', v); }
  if (b.soat_until !== undefined) { if (!isYmd(b.soat_until)) fail(400, 'Escribe la fecha de vencimiento del SOAT.'); if (b.soat_until <= new Date().toISOString().slice(0, 10)) fail(400, 'El SOAT debe estar vigente. Revisa la fecha.'); set('soat_until', b.soat_until); }
  if (b.rt_ok !== undefined) set('rt_ok', !!b.rt_ok);
  if (b.yape_phone !== undefined) { if (b.yape_phone !== '' && !isPhone(b.yape_phone)) fail(400, 'El número de Yape debe tener 9 dígitos y empezar con 9.'); set('yape_phone', b.yape_phone || null); }
  if (b.plin_phone !== undefined) { if (b.plin_phone !== '' && !isPhone(b.plin_phone)) fail(400, 'El número de Plin debe tener 9 dígitos y empezar con 9.'); set('plin_phone', b.plin_phone || null); }
  const sensitive = ['lic_num', 'lic_cat', 'vtype', 'model', 'plate', 'soat_until', 'rt_ok'].some(k => k in next && S(next[k]) !== S(cur[k] instanceof Date ? cur[k].toISOString().slice(0, 10) : cur[k]));
  if (sets.length) await q('update driver_profiles set ' + sets.join(', ') + ' where user_id = $1', vals);
  if (sensitive) await reopenReview(req.user.id, 'conductor');
  res.json({ me: await meDto(req.user.id) });
}));

// Si cambian datos o documentos ya revisados, el administrador los revisa otra vez.
async function reopenReview(uid, role) {
  if (role === 'conductor') await q(`update driver_profiles set status = case status when 'approved' then 'pending' when 'rejected' then 'draft' else status end where user_id = $1`, [uid]);
  else await q(`update users set pax_status = case pax_status when 'approved' then 'pending' when 'rejected' then 'none' else pax_status end where id = $1`, [uid]);
}

const FILE_KINDS = {
  selfie: ['users', 'selfie_file_id', 'both'], dni_photo: ['users', 'dni_file_id', 'both'],
  lic: ['dp', 'lic_file_id', 'conductor'], soat: ['dp', 'soat_file_id', 'conductor'], ant: ['dp', 'ant_file_id', 'conductor'],
  veh_ext: ['dp', 'veh_ext_file_id', 'conductor'], veh_int: ['dp', 'veh_int_file_id', 'conductor'], veh_bag: ['dp', 'veh_bag_file_id', 'conductor']
};
api.post('/me/files', needUser, A(async (req, res) => {
  limit('upl|' + req.user.id, 60, 3600e3);
  const kind = S(req.body.kind), def = FILE_KINDS[kind];
  if (!def) fail(400, 'Tipo de archivo no válido.');
  if (def[0] === 'dp' && !req.user.drv_status) fail(403, 'Necesitas una cuenta de conductor.');
  if (kind !== 'ant' && kind !== 'lic' && kind !== 'soat' && /^data:application\/pdf/.test(S(req.body.data))) fail(400, 'Para esta foto usa una imagen, no un PDF.');
  await tx(async c => {
    const id = await saveFile(c, req.user.id, kind, req.body.data);
    const tbl = def[0] === 'users' ? 'users' : 'driver_profiles', key = def[0] === 'users' ? 'id' : 'user_id';
    const old = (await c.query(`select ${def[1]} as f from ${tbl} where ${key} = $1`, [req.user.id])).rows[0].f;
    await c.query(`update ${tbl} set ${def[1]} = $2 where ${key} = $1`, [req.user.id, id]);
    if (old) await c.query('delete from files where id = $1 and owner_id = $2', [old, req.user.id]);
  });
  if (def[0] === 'users') { await reopenReview(req.user.id, 'pasajero'); if (req.user.drv_status) await reopenReview(req.user.id, 'conductor'); }
  else await reopenReview(req.user.id, 'conductor');
  res.json({ me: await meDto(req.user.id) });
}));

api.post('/me/submit', needUser, A(async (req, res) => {
  const role = req.body.role === 'conductor' ? 'conductor' : 'pasajero'; const me = await meDto(req.user.id); const miss = [];
  if (!me.files.selfie) miss.push('selfie'); if (!me.files.dni_photo) miss.push('foto del DNI');
  if (role === 'pasajero') {
    if (!me.emerg.name || !me.emerg.phone) miss.push('contacto de emergencia');
  } else {
    const d = me.driver; if (!d) fail(403, 'Necesitas una cuenta de conductor.');
    if (!d.lic.num || !d.lic.file) miss.push('licencia'); if (!d.veh.model || !d.veh.plate) miss.push('vehículo');
    if (!d.veh.ext || !d.veh.int) miss.push('fotos del vehículo'); if (!d.soat.until || !d.soat.file || !d.rt) miss.push('SOAT y revisión técnica');
    if (!d.ant) miss.push('antecedentes'); if (!d.yape && !d.plin) miss.push('número de Yape o Plin para cobrar');
  }
  if (miss.length) fail(400, 'Te falta: ' + miss.join(', ') + '.', { missing: miss });
  if (role === 'pasajero') await q(`update users set pax_status = 'pending', pax_note = null where id = $1 and pax_status in ('none','rejected')`, [req.user.id]);
  else await q(`update driver_profiles set status = 'pending', review_note = null, submitted_at = now() where user_id = $1 and status in ('draft','rejected')`, [req.user.id]);
  res.json({ me: await meDto(req.user.id) });
}));

/* ---------- archivos ---------- */
api.get('/files/:id', needUser, A(async (req, res) => {
  const f = (await q('select * from files where id = $1', [+req.params.id || 0])).rows[0];
  if (!f) fail(404, 'No existe.');
  let ok = f.owner_id === req.user.id || req.user.is_admin;
  if (!ok) {
    const owner = (await q('select u.id, dp.status from users u left join driver_profiles dp on dp.user_id = u.id where u.id = $1', [f.owner_id])).rows[0];
    if (['selfie', 'veh_ext', 'veh_int', 'veh_bag'].includes(f.kind) && owner && owner.status === 'approved') ok = true;
    if (!ok && f.kind === 'selfie') ok = (await q(`select 1 from bookings b join trips t on t.id = b.trip_id where b.user_id = $1 and t.driver_id = $2 and b.status in ('por_confirmar','confirmado') limit 1`, [f.owner_id, req.user.id])).rowCount > 0;
    if (!ok && f.kind === 'capture') ok = (await q(`select 1 from payments p join bookings b on b.id = p.booking_id join trips t on t.id = b.trip_id where p.capture_file_id = $1 and t.driver_id = $2`, [f.id, req.user.id])).rowCount > 0;
  }
  if (!ok) fail(403, 'No tienes acceso a este archivo.');
  res.setHeader('Content-Type', f.mime); res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox"); res.send(f.data);
}));

/* ---------- viajes: búsqueda y detalle ---------- */
async function seatState(tripId, uid) {
  const r = await q(`select bs.seat, b.id as bid, b.user_id, b.hold_until, b.status from booking_seats bs join bookings b on b.id = bs.booking_id
     where bs.trip_id = $1 and bs.active and (b.status in ('por_confirmar','confirmado') or (b.status = 'hold' and b.hold_until > now()))`, [tripId]);
  const mine = r.rows.filter(x => x.user_id === uid);
  return { occupied: r.rows.map(x => x.seat), mine: mine.map(x => x.seat), holding: mine.filter(x => x.status === 'hold').map(x => x.seat), holdUntil: (mine.find(x => x.status === 'hold') || {}).hold_until || null, holdId: (mine.find(x => x.status === 'hold') || {}).bid ? String(mine.find(x => x.status === 'hold').bid) : null };
}
const loadTrip = async (id, c) => (await (c || pool).query(`select ${TRIP_COLS} from trips t where t.id = $1`, [+id || 0])).rows[0] || null;

api.get('/trips', needUser, A(async (req, res) => {
  const from = S(req.query.from), date = S(req.query.date);
  if (!OFF[from] || !isYmd(date)) fail(400, 'Búsqueda no válida.');
  const r = await q(`select ${TRIP_COLS} from trips t where t.trip_date = $1 and t.from_off = $2 and t.status in ('active','started') order by t.dep_time`, [date, from]);
  res.json({ trips: r.rows.map(tripDto), drivers: await driversMap(r.rows.map(t => t.driver_id)) });
}));

api.get('/trips/:id', needUser, A(async (req, res) => {
  const t = await loadTrip(req.params.id); if (!t) fail(404, 'Este viaje ya no está disponible.');
  const drivers = await driversMap([t.driver_id]);
  const dp = (await q('select yape_phone, plin_phone from driver_profiles where user_id = $1', [t.driver_id])).rows[0] || {};
  const rv = await q(`select r.stars, r.tags, r.comment, r.created_at, u.name from reviews r join users u on u.id = r.passenger_id where r.driver_id = $1 order by r.created_at desc limit 4`, [t.driver_id]);
  res.json({ trip: tripDto(t), drivers, pay: { yape: dp.yape_phone || null, plin: dp.plin_phone || null }, seatState: await seatState(t.id, req.user.id),
    reviews: rv.rows.map(x => ({ s: x.stars, t: x.comment, tags: x.tags, a: shortName(x.name), at: x.created_at })) });
}));
api.get('/trips/:id/seats', needUser, A(async (req, res) => {
  const t = await loadTrip(req.params.id); if (!t) fail(404, 'Este viaje ya no está disponible.');
  res.json({ trip: tripDto(t), seatState: await seatState(t.id, req.user.id) });
}));

api.get('/drivers/:id/reviews', needUser, A(async (req, res) => {
  const id = req.params.id === 'me' ? req.user.id : +req.params.id || 0;
  const rv = await q(`select r.stars, r.tags, r.flags, r.comment, r.created_at, u.name from reviews r join users u on u.id = r.passenger_id where r.driver_id = $1 order by r.created_at desc limit 40`, [id]);
  res.json({ reviews: rv.rows.map(x => ({ s: x.stars, t: x.comment, tags: x.tags, a: shortName(x.name), at: x.created_at })) });
}));

/* ---------- reservas: asientos, pago ---------- */
async function expireStale(c, tripId) {
  const e = await c.query(`update bookings set status = 'expirado' where trip_id = $1 and status = 'hold' and hold_until < now() returning id`, [tripId]);
  if (e.rowCount) await c.query(`update booking_seats set active = false, released_at = now() where booking_id = any($1) and active`, [e.rows.map(r => r.id)]);
}
const bookingSeats = async (c, id) => (await c.query('select seat from booking_seats where booking_id = $1 and active order by seat', [id])).rows.map(r => r.seat);

api.post('/trips/:id/hold', needUser, A(async (req, res) => {
  limit('hold|' + req.user.id, 120, 600e3);
  const out = await tx(async c => {
    const t0 = (await c.query('select id from trips where id = $1 for update', [+req.params.id || 0])).rows[0];
    if (!t0) fail(404, 'Este viaje ya no está disponible.');
    const t = await loadTrip(t0.id, c);
    if (t.status !== 'active' || new Date(t.dep_at) < new Date()) fail(409, 'Este viaje ya salió o no admite reservas.');
    if (t.driver_id === req.user.id) fail(403, 'No puedes reservar en tu propio viaje.');
    await expireStale(c, t.id);
    const want = [...new Set((Array.isArray(req.body.seats) ? req.body.seats : []).map(Number))];
    if (want.some(n => !Number.isInteger(n) || n < 1 || n > t.seats)) fail(400, 'Asiento no válido.');
    if (want.length > 8) fail(400, 'Demasiados asientos.');
    let b = (await c.query(`select * from bookings where trip_id = $1 and user_id = $2 and status = 'hold' limit 1`, [t.id, req.user.id])).rows[0];
    const have = b ? await bookingSeats(c, b.id) : [];
    const add = want.filter(n => !have.includes(n)), del = have.filter(n => !want.includes(n));
    if (add.length) {
      const taken = (await c.query('select seat from booking_seats where trip_id = $1 and active and seat = any($2)', [t.id, add])).rows.map(r => r.seat);
      if (taken.length) fail(409, 'Este asiento ya fue reservado. Elige otro.', { taken });
    }
    if (!want.length) {
      if (b) { await c.query(`update bookings set status = 'cancelado' where id = $1`, [b.id]); await c.query('update booking_seats set active = false, released_at = now() where booking_id = $1 and active', [b.id]); }
      return null;
    }
    if (!b) {
      for (let i = 0; i < 6 && !b; i++) {
        try { b = (await c.query(`insert into bookings (code, trip_id, user_id, status, hold_until) values ($1,$2,$3,'hold', now() + interval '${HOLD_MIN} minutes') returning *`, [bookingCode(), t.id, req.user.id])).rows[0]; }
        catch (e) { if (e.code !== '23505') throw e; }
      }
      if (!b) fail(500, 'No pudimos crear la reserva. Inténtalo otra vez.');
    }
    if (del.length) await c.query('update booking_seats set active = false, released_at = now() where booking_id = $1 and seat = any($2) and active', [b.id, del]);
    for (const n of add) await c.query('insert into booking_seats (booking_id, trip_id, seat) values ($1,$2,$3)', [b.id, t.id, n]);
    await reprice(c, b.id);
    b = (await c.query('select * from bookings where id = $1', [b.id])).rows[0];
    return bookingDto(b, await bookingSeats(c, b.id));
  });
  res.json({ booking: out, seatState: await seatState(+req.params.id, req.user.id) });
}));

const CAPTURE_KIND = 'capture';
api.post('/bookings/:id/pay', needUser, A(async (req, res) => {
  limit('pay|' + req.user.id, 20, 3600e3);
  const method = S(req.body.method), op = S(req.body.opNo).trim();
  if (!['yape', 'plin'].includes(method)) fail(400, 'Elige Yape o Plin.');
  if (!/^[A-Za-z0-9-]{5,20}$/.test(op)) fail(400, 'Escribe el número de operación tal como sale en tu comprobante.');
  if (!req.body.capture) fail(400, 'Sube la captura de tu pago.');
  const info = await tx(async c => {
    const b = (await c.query('select * from bookings where id = $1 and user_id = $2 for update', [+req.params.id || 0, req.user.id])).rows[0];
    if (!b) fail(404, 'No encontramos esa reserva.');
    if (b.status !== 'hold') fail(409, b.status === 'por_confirmar' ? 'Ya enviaste el pago de esta reserva.' : 'Esta reserva ya no está disponible.');
    if (new Date(b.hold_until) < new Date()) { await expireStale(c, b.trip_id); fail(409, 'Tu reserva expiró. Vuelve a elegir tu asiento.'); }
    const t = await loadTrip(b.trip_id, c);
    if (t.status !== 'active' || new Date(t.dep_at) < new Date()) fail(409, 'Este viaje ya salió.');
    const dp = (await c.query('select yape_phone, plin_phone from driver_profiles where user_id = $1', [t.driver_id])).rows[0];
    if (!dp || !dp[method + '_phone']) fail(400, 'Este conductor no recibe pagos por ' + (method === 'yape' ? 'Yape' : 'Plin') + '.');
    const seats = await bookingSeats(c, b.id); if (!seats.length) fail(409, 'Elige al menos un asiento.');
    const price = await reprice(c, b.id);
    const fid = await saveFile(c, req.user.id, CAPTURE_KIND, req.body.capture);
    await c.query('insert into payments (booking_id, method, amount, operation_no, capture_file_id) values ($1,$2,$3,$4,$5)', [b.id, method, price.total, op, fid]);
    await c.query(`update bookings set status = 'por_confirmar', hold_until = null where id = $1`, [b.id]);
    const d = (await c.query('select email, name from users where id = $1', [t.driver_id])).rows[0];
    return { t, seats, total: price.total, d, code: b.code, id: b.id };
  });
  sendMail(info.d.email, 'Nuevo pago por confirmar · ' + info.code, 'Tienes un pago por confirmar',
    `<p>${esc(req.user.name)} reservó el asiento ${info.seats.join(', ')} en tu viaje ${OFF[info.t.from]} → ${OFF[info.t.from === 'tru' ? 'chi' : 'tru']} (${info.t.date} ${info.t.time}).</p><p>Monto: <b>${sol(info.total)}</b> por ${method === 'yape' ? 'Yape' : 'Plin'}. Revisa que te llegó y confírmalo en la app (Panel o Pasajeros).</p>`);
  const b = (await q('select * from bookings where id = $1', [info.id])).rows[0];
  res.json({ booking: bookingDto(b, info.seats) });
}));

async function myBookings(uid, onlyId) {
  const r = await q(`select ${TRIP_COLS}, b.id as bid, b.code, b.trip_id, b.status as bstatus, b.hold_until, b.subtotal, b.promo_name, b.promo_pct, b.total, b.rated,
      p.method as pay_method, p.status as pay_status, p.note as pay_note, p.operation_no,
      (select coalesce(array_agg(bs.seat order by bs.seat), '{}') from booking_seats bs where bs.booking_id = b.id and (bs.active or bs.noshow)) as seat_list,
      (select count(*)::int from booking_seats bs where bs.booking_id = b.id and bs.boarded_at is not null) as boarded
    from bookings b join trips t on t.id = b.trip_id left join payments p on p.booking_id = b.id
    where b.user_id = $1 and b.status in ('por_confirmar','confirmado','rechazado','no_presentado','cancelado') ${onlyId ? 'and b.id = $2' : ''}
    order by t.dep_at desc`, onlyId ? [uid, onlyId] : [uid]);
  const drivers = await driversMap(r.rows.map(x => x.driver_id));
  return {
    drivers,
    bookings: r.rows.map(x => Object.assign(bookingDto({ id: x.bid, code: x.code, trip_id: x.trip_id, status: x.bstatus, hold_until: x.hold_until, subtotal: x.subtotal, promo_name: x.promo_name, promo_pct: x.promo_pct, total: x.total, rated: x.rated }, x.seat_list), {
      trip: tripDto(x), payMethod: x.pay_method, payStatus: x.pay_status, payNote: x.pay_note, opNo: x.operation_no,
      noShow: x.bstatus === 'no_presentado', boarded: x.boarded
    }))
  };
}
api.get('/bookings', needUser, A(async (req, res) => res.json(await myBookings(req.user.id))));
api.get('/bookings/:id', needUser, A(async (req, res) => {
  const r = await myBookings(req.user.id, +req.params.id || 0); if (!r.bookings.length) fail(404, 'No encontramos este boleto.');
  res.json({ booking: r.bookings[0], drivers: r.drivers });
}));

api.post('/bookings/:id/rate', needUser, A(async (req, res) => {
  const stars = Math.round(+req.body.stars);
  if (!(stars >= 1 && stars <= 5)) fail(400, 'Elige de 1 a 5 estrellas.');
  const TAGS = ['Puntual', 'Manejo seguro', 'Vehículo limpio', 'Amable', 'Respetó la ruta', 'Buen trato al equipaje'];
  const BAD = ['Exceso de velocidad', 'Se desvió de la ruta', 'Me cobró extra', 'Placa distinta a la app'];
  const tags = (Array.isArray(req.body.tags) ? req.body.tags : []).filter(x => TAGS.includes(x));
  const flags = stars <= 3 ? (Array.isArray(req.body.flags) ? req.body.flags : []).filter(x => BAD.includes(x)) : [];
  const text = S(req.body.comment).trim().slice(0, 300) || null;
  await tx(async c => {
    const b = (await c.query(`select b.*, t.driver_id, t.status as tstatus from bookings b join trips t on t.id = b.trip_id where b.id = $1 and b.user_id = $2 for update of b`, [+req.params.id || 0, req.user.id])).rows[0];
    if (!b) fail(404, 'No encontramos esa reserva.');
    if (b.status !== 'confirmado') fail(409, 'Solo puedes calificar viajes que hiciste.');
    if (b.tstatus !== 'finished') fail(409, 'Podrás calificar cuando el viaje termine.');
    if (b.rated) fail(409, 'Ya calificaste este viaje.');
    await c.query('insert into reviews (booking_id, trip_id, driver_id, passenger_id, stars, tags, flags, comment) values ($1,$2,$3,$4,$5,$6,$7,$8)', [b.id, b.trip_id, b.driver_id, req.user.id, stars, tags, flags, text]);
    await c.query('update bookings set rated = true where id = $1', [b.id]);
    if (flags.length) await c.query(`insert into incidents (kind, trip_id, user_id, booking_id, issues) values ('reporte',$1,$2,$3,$4)`, [b.trip_id, req.user.id, b.id, flags]);
  });
  res.json({ ok: true });
}));

/* ---------- conductor: publicar, editar, cancelar ---------- */
function validTripInput(b, vtype, strictFuture) {
  if (!isYmd(b.date)) fail(400, 'Elige una fecha.');
  if (!/^[0-2]\d:[0-5]\d$/.test(S(b.time)) || +S(b.time).slice(0, 2) > 23) fail(400, 'Escribe la hora de salida.');
  const price = Number(b.price), seats = Math.round(Number(b.seats));
  if (!(price >= 20 && price <= 120)) fail(400, 'El precio debe estar entre S/ 20 y S/ 120.');
  if (!(seats >= 1 && seats <= VSEATS[vtype])) fail(400, 'Puedes ofrecer de 1 a ' + VSEATS[vtype] + ' asientos.');
  if (strictFuture && Date.parse(b.date + 'T' + b.time + ':00-05:00') < Date.now()) fail(400, 'Esa hora ya pasó. Elige una hora futura.');
  return { price: Math.round(price * 100) / 100, seats };
}
api.post('/trips', needUser, needApprovedDriver, A(async (req, res) => {
  const b = req.body; if (!OFF[b.from]) fail(400, 'Elige el sentido del viaje.');
  const dp = (await q('select * from driver_profiles where user_id = $1', [req.user.id])).rows[0];
  if (!dp.yape_phone && !dp.plin_phone) fail(400, 'Agrega tu número de Yape o Plin para recibir pagos.');
  const v = validTripInput(b, dp.vtype, true);
  const r = await q(`insert into trips (driver_id, from_off, trip_date, dep_time, dep_at, price, seats, vtype, veh_model, veh_plate, veh_color)
      values ($1,$2,$3::date,$4::text, ($3::date + $4::text::time) at time zone 'America/Lima', $5,$6,$7,$8,$9,$10) returning id`,
    [req.user.id, b.from, b.date, b.time, v.price, v.seats, dp.vtype, dp.model, dp.plate, dp.color]);
  res.json({ trip: tripDto(await loadTrip(r.rows[0].id)) });
}));

async function notifyTrip(tripId, subject, title, html) {
  const r = await q(`select distinct u.email from bookings b join users u on u.id = b.user_id where b.trip_id = $1 and b.status in ('por_confirmar','confirmado')`, [tripId]);
  r.rows.forEach(x => sendMail(x.email, subject, title, html));
}
const tripLabel = t => `${OFF[t.from]} → ${OFF[t.from === 'tru' ? 'chi' : 'tru']} · ${t.date} ${t.time}`;

api.put('/trips/:id', needUser, needDriver, A(async (req, res) => {
  const t = await loadTrip(req.params.id); if (!t || (t.driver_id !== req.user.id && !req.user.is_admin)) fail(404, 'No encontramos ese viaje.');
  if (t.status !== 'active') fail(409, 'Este viaje ya no se puede editar.');
  const b = Object.assign({ date: t.date, time: t.time, price: t.price, seats: t.seats }, req.body);
  const v = validTripInput(b, t.vtype, true);
  const maxSeat = (await q('select coalesce(max(seat),0)::int m from booking_seats where trip_id = $1 and active', [t.id])).rows[0].m;
  if (v.seats < maxSeat || v.seats < t.taken) fail(409, 'Ya hay asientos reservados hasta el ' + maxSeat + '. No puedes ofrecer menos.');
  await q(`update trips set trip_date = $2::date, dep_time = $3::text, dep_at = ($2::date + $3::text::time) at time zone 'America/Lima', price = $4, seats = $5 where id = $1`, [t.id, b.date, b.time, v.price, v.seats]);
  const n = await loadTrip(t.id);
  const changes = [];
  if (t.date !== n.date || t.time !== n.time) changes.push(`Nueva salida: <b>${n.date} a las ${n.time}</b> (antes ${t.date} ${t.time}).`);
  if (t.price !== n.price) changes.push(`Nuevo precio por asiento: <b>${sol(n.price)}</b>. Tu reserva conserva el precio que pagaste.`);
  if (changes.length) notifyTrip(t.id, 'Cambió tu viaje ' + tripLabel(n), 'Cambió tu viaje', `<p>${tripLabel(t)}</p><p>${changes.join('<br>')}</p><p>Si no te sirve, coordina con el conductor.</p>`);
  res.json({ trip: tripDto(n) });
}));

async function cancelTrip(tripId, reason) {
  const info = await tx(async c => {
    const t = (await c.query(`select ${TRIP_COLS}, u.name as dname, u.phone as dphone from trips t join users u on u.id = t.driver_id where t.id = $1 for update of t`, [tripId])).rows[0];
    if (!t || !['active', 'started'].includes(t.status)) return null;
    await c.query(`update trips set status = 'cancelled' where id = $1`, [tripId]);
    const bk = await c.query(`update bookings set status = 'cancelado' where trip_id = $1 and status in ('hold','por_confirmar','confirmado') returning id, user_id, status`, [tripId]);
    await c.query(`update booking_seats set active = false, released_at = now() where trip_id = $1 and active`, [tripId]);
    await c.query(`update payments set status = 'rechazado', note = 'Viaje cancelado', decided_at = now() where booking_id = any($1) and status = 'pendiente'`, [bk.rows.map(x => x.id)]);
    const emails = (await c.query(`select distinct u.email from users u where u.id = any($1)`, [bk.rows.map(x => x.user_id)])).rows;
    return { t, emails };
  });
  if (info) info.emails.forEach(e => sendMail(e.email, 'Se canceló tu viaje ' + tripLabel(info.t), 'Se canceló tu viaje',
    `<p>${tripLabel(info.t)} fue cancelado${reason ? ': ' + esc(reason) : ''}.</p><p>Si ya habías pagado, pide la devolución a ${esc(info.t.dname)} (celular ${esc(info.t.dphone || '—')}). Puedes reservar otra salida en la app.</p>`));
  return !!info;
}
api.post('/trips/:id/cancel', needUser, needDriver, A(async (req, res) => {
  const t = await loadTrip(req.params.id); if (!t || (t.driver_id !== req.user.id && !req.user.is_admin)) fail(404, 'No encontramos ese viaje.');
  if (!(await cancelTrip(t.id, S(req.body.reason).slice(0, 120)))) fail(409, 'Este viaje ya no se puede cancelar.');
  res.json({ ok: true });
}));

/* ---------- conductor: panel, pasajeros, pagos, abordaje ---------- */
api.get('/driver/trips', needUser, needDriver, A(async (req, res) => {
  const r = await q(`select ${TRIP_COLS},
      (select count(*)::int from booking_seats bs join bookings b on b.id = bs.booking_id where bs.trip_id = t.id and bs.active and b.status = 'confirmado') as sold,
      (select count(*)::int from booking_seats bs join bookings b on b.id = bs.booking_id where bs.trip_id = t.id and bs.active and b.status = 'por_confirmar') as pending,
      (select count(*)::int from booking_seats bs where bs.trip_id = t.id and bs.active and bs.boarded_at is not null) as boarded
    from trips t where t.driver_id = $1 and t.status <> 'cancelled' and t.dep_at > now() - interval '2 days' order by t.dep_at`, [req.user.id]);
  const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const trips = r.rows.map(x => Object.assign(tripDto(x), { sold: x.sold, pending: x.pending, boarded: x.boarded }));
  const day = trips.filter(t => t.date === today);
  res.json({ trips, today: { pax: day.reduce((a, t) => a + t.sold, 0), income: day.reduce((a, t) => a + t.sold * t.price, 0) },
    pendingPayments: trips.reduce((a, t) => a + t.pending, 0) });
}));

async function ownTrip(req) {
  const t = await loadTrip(req.params.id);
  if (!t || (t.driver_id !== req.user.id && !req.user.is_admin)) fail(404, 'No encontramos ese viaje.');
  return t;
}
api.get('/driver/trips/:id/manifest', needUser, needDriverOrAdmin, A(async (req, res) => {
  const t = await ownTrip(req);
  const r = await q(`select bs.seat, bs.active, bs.boarded_at, bs.noshow, bs.released_at, bs.pax_rating, b.id as booking_id, b.code, b.status as bstatus, b.created_at as bcreated,
      u.id as uid, u.name, u.phone, u.pax_status, u.selfie_file_id,
      (select avg(x.pax_rating)::float from booking_seats x join bookings y on y.id = x.booking_id where y.user_id = u.id and x.pax_rating is not null) as pax_avg,
      p.id as payment_id, p.status as pay_status, p.method, p.amount, p.operation_no, p.capture_file_id, p.created_at as pcreated
    from booking_seats bs join bookings b on b.id = bs.booking_id join users u on u.id = b.user_id left join payments p on p.booking_id = b.id
    where bs.trip_id = $1 and b.status in ('por_confirmar','confirmado','no_presentado') order by bs.seat, bs.id`, [t.id]);
  const seats = r.rows.filter(x => x.active || x.noshow).map(x => ({
    seat: x.seat, state: x.noshow ? 'released' : x.boarded_at ? 'on' : x.bstatus === 'confirmado' ? 'sold' : 'pending',
    bookingId: String(x.booking_id), code: x.code, name: x.name, phone: x.phone, photo: fileUrl(x.selfie_file_id), trusted: x.pax_status === 'approved',
    rating: x.pax_avg, myRating: x.pax_rating, paymentId: x.payment_id ? String(x.payment_id) : null, payStatus: x.pay_status, method: x.method, amount: x.amount,
    opNo: x.operation_no, capture: fileUrl(x.capture_file_id)
  }));
  // últimas compras y liberaciones para la lista «en vivo»
  const feed = [];
  r.rows.forEach(x => {
    if (x.bstatus !== 'no_presentado' && x.active) feed.push({ k: 'compra', seat: x.seat, name: x.name, pay: x.method, at: x.pcreated || x.bcreated, confirmed: x.bstatus === 'confirmado' });
    if (x.noshow) feed.push({ k: 'libre', seat: x.seat, name: x.name, at: x.released_at });
  });
  feed.sort((a, b) => new Date(b.at) - new Date(a.at));
  const live = (await q('select lat, lon, speed_kmh, updated_at from live_locations where trip_id = $1', [t.id])).rows[0] || null;
  res.json({ trip: tripDto(t), seats, feed: feed.slice(0, 12), live });
}));

async function decidePayment(req, res, ok) {
  const out = await tx(async c => {
    const p = (await c.query(`select p.*, b.trip_id, b.user_id, b.code, b.status as bstatus, t.driver_id from payments p join bookings b on b.id = p.booking_id join trips t on t.id = b.trip_id where p.id = $1 for update of p, b`, [+req.params.id || 0])).rows[0];
    if (!p || (p.driver_id !== req.user.id && !req.user.is_admin)) fail(404, 'No encontramos ese pago.');
    if (p.status !== 'pendiente' || p.bstatus !== 'por_confirmar') fail(409, 'Este pago ya fue revisado.');
    const note = S(req.body.note).trim().slice(0, 160) || null;
    if (!ok && !note) fail(400, 'Escribe el motivo para rechazar el pago.');
    await c.query('update payments set status = $2, note = $3, decided_by = $4, decided_at = now() where id = $1', [p.id, ok ? 'confirmado' : 'rechazado', note, req.user.id]);
    await c.query('update bookings set status = $2 where id = $1', [p.booking_id, ok ? 'confirmado' : 'rechazado']);
    if (!ok) await c.query('update booking_seats set active = false, released_at = now() where booking_id = $1 and active', [p.booking_id]);
    const seats = (await c.query('select seat from booking_seats where booking_id = $1 order by seat', [p.booking_id])).rows.map(x => x.seat);
    const t = await loadTrip(p.trip_id, c);
    const u = (await c.query('select email, name from users where id = $1', [p.user_id])).rows[0];
    const d = (await c.query('select name, phone from users where id = $1', [t.driver_id])).rows[0];
    return { p, seats, t, u, d, note };
  });
  const { p, seats, t, u, d, note } = out;
  if (ok) sendMail(u.email, 'Reserva confirmada · ' + p.code, 'Tu asiento está confirmado',
    `<p>Hola ${esc(firstName(u.name))}, tu pago de <b>${sol(p.amount)}</b> fue confirmado.</p><p><b>${tripLabel(t)}</b><br>Asiento(s): <b>${seats.join(', ')}</b><br>Vehículo: ${esc(t.veh_model)} · placa <b>${esc(t.veh_plate)}</b><br>Conductor: ${esc(d.name)} (${esc(d.phone || '—')})<br>Código de boleto: <b>${p.code}</b></p><p>Llega 15 min antes a la oficina de ${OFF[t.from]}. El conductor espera hasta ${WAIT_MIN} min después de la salida.</p>`);
  else sendMail(u.email, 'No pudimos confirmar tu pago · ' + p.code, 'Pago no confirmado',
    `<p>El conductor no pudo confirmar tu pago de ${sol(p.amount)} (operación ${esc(p.operation_no)}).</p><p>Motivo: ${esc(note)}</p><p>Tu asiento se liberó. Puedes reservar otra vez en la app.</p>`);
  res.json({ ok: true });
}
api.post('/payments/:id/confirm', needUser, needDriverOrAdmin, A((req, res) => decidePayment(req, res, true)));
api.post('/payments/:id/reject', needUser, needDriverOrAdmin, A((req, res) => decidePayment(req, res, false)));

// Abordaje: por código del QR (cámara del chófer) o por número de asiento.
api.post('/trips/:id/board', needUser, needDriver, A(async (req, res) => {
  const t = await ownTrip(req);
  if (!['active', 'started'].includes(t.status)) fail(409, 'Este viaje ya no está activo.');
  const code = S(req.body.code).trim().toUpperCase().replace(/^VIP\|/, '');
  const seat = Number(req.body.seat);
  let rows;
  if (code) rows = (await q(`select bs.id, bs.seat, bs.boarded_at, b.status, b.code, u.name from booking_seats bs join bookings b on b.id = bs.booking_id join users u on u.id = b.user_id where bs.trip_id = $1 and b.code = $2 and bs.active`, [t.id, code.split('|')[0]])).rows;
  else if (seat) rows = (await q(`select bs.id, bs.seat, bs.boarded_at, b.status, b.code, u.name from booking_seats bs join bookings b on b.id = bs.booking_id join users u on u.id = b.user_id where bs.trip_id = $1 and bs.seat = $2 and bs.active`, [t.id, seat])).rows;
  else fail(400, 'Escanea el QR o elige el asiento.');
  if (!rows.length) fail(404, code ? 'Ese boleto no es de este viaje o ya no está vigente.' : 'Ese asiento no tiene pasajero.');
  if (rows.some(r => r.status !== 'confirmado')) fail(409, 'El pago de este pasajero aún no está confirmado. Confírmalo primero.');
  const fresh = rows.filter(r => !r.boarded_at);
  if (fresh.length) await q('update booking_seats set boarded_at = now() where id = any($1)', [fresh.map(r => r.id)]);
  res.json({ name: rows[0].name, code: rows[0].code, seats: rows.map(r => r.seat), already: !fresh.length });
}));

api.post('/trips/:id/pax-rate', needUser, needDriver, A(async (req, res) => {
  const t = await ownTrip(req); const stars = Math.round(+req.body.stars), seat = +req.body.seat;
  if (t.status !== 'finished') fail(409, 'Podrás calificar cuando termine el viaje.');
  if (!(stars >= 1 && stars <= 5)) fail(400, 'Elige de 1 a 5 estrellas.');
  const r = await q(`update booking_seats bs set pax_rating = $3 from bookings b where b.id = bs.booking_id and bs.trip_id = $1 and bs.seat = $2 and bs.active and b.status = 'confirmado'`, [t.id, seat, stars]);
  if (!r.rowCount) fail(404, 'Ese asiento no tiene pasajero.');
  res.json({ ok: true });
}));

/* ---------- GPS en vivo ---------- */
api.post('/trips/:id/start', needUser, needDriver, A(async (req, res) => {
  const t = await ownTrip(req);
  if (t.status === 'started') return res.json({ ok: true });
  if (t.status !== 'active') fail(409, 'Este viaje no se puede iniciar.');
  await q(`update trips set status = 'started', started_at = now() where id = $1`, [t.id]);
  res.json({ ok: true });
}));
api.post('/trips/:id/finish', needUser, needDriver, A(async (req, res) => {
  const t = await ownTrip(req);
  if (t.status === 'finished') return res.json({ ok: true });
  if (t.status !== 'started') fail(409, 'Primero inicia el viaje.');
  await q(`update trips set status = 'finished', finished_at = now() where id = $1`, [t.id]);
  res.json({ ok: true });
}));
api.post('/trips/:id/location', needUser, needDriver, A(async (req, res) => {
  const t = await ownTrip(req);
  const lat = +req.body.lat, lon = +req.body.lon; const sp = req.body.speed == null ? null : Math.max(0, Math.min(200, +req.body.speed));
  if (!(lat > -90 && lat < 90 && lon > -180 && lon < 180)) fail(400, 'Ubicación no válida.');
  if (t.status !== 'started') fail(409, 'El viaje no está en curso.');
  await q(`insert into live_locations (trip_id, lat, lon, speed_kmh, updated_at) values ($1,$2,$3,$4, now())
     on conflict (trip_id) do update set lat = excluded.lat, lon = excluded.lon, speed_kmh = excluded.speed_kmh, updated_at = now()`, [t.id, lat, lon, sp]);
  res.json({ ok: true });
}));
api.get('/trips/:id/live', needUser, A(async (req, res) => {
  const t = await loadTrip(req.params.id); if (!t) fail(404, 'No encontramos ese viaje.');
  const allowed = t.driver_id === req.user.id || req.user.is_admin ||
    (await q(`select 1 from bookings where trip_id = $1 and user_id = $2 and status in ('por_confirmar','confirmado') limit 1`, [t.id, req.user.id])).rowCount > 0;
  if (!allowed) fail(403, 'Solo los pasajeros de este viaje pueden verlo.');
  const l = (await q('select lat, lon, speed_kmh, updated_at from live_locations where trip_id = $1', [t.id])).rows[0] || null;
  res.json({ trip: tripDto(t), drivers: await driversMap([t.driver_id]), live: l && { lat: l.lat, lon: l.lon, speed: l.speed_kmh, at: l.updated_at } });
}));

/* ---------- SOS ---------- */
api.post('/incidents', needUser, A(async (req, res) => {
  limit('sos|' + req.user.id, 10, 3600e3);
  const t = await loadTrip(req.body.tripId);
  const lat = req.body.lat == null ? null : +req.body.lat, lon = req.body.lon == null ? null : +req.body.lon;
  await q(`insert into incidents (kind, trip_id, user_id, lat, lon) values ('sos',$1,$2,$3,$4)`, [t ? t.id : null, req.user.id, isFinite(lat) ? lat : null, isFinite(lon) ? lon : null]);
  const admin = process.env.ADMIN_EMAIL;
  if (admin) sendMail(admin, 'ALERTA SOS · ' + req.user.name, 'Alerta SOS de un pasajero',
    `<p><b>${esc(req.user.name)}</b> (${esc(req.user.phone || '—')}) pidió ayuda${t ? ' en el viaje ' + esc(tripLabel(t)) + ' · placa ' + esc(t.veh_plate) : ''}.</p>${lat != null && lon != null ? `<p><a href="https://www.google.com/maps?q=${lat},${lon}">Ver ubicación</a></p>` : ''}<p>Revísalo en el panel de incidentes.</p>`);
  res.json({ ok: true });
}));

/* ================= administración ================= */
const admin = express.Router();
api.use('/admin', needUser, needAdmin, admin);

admin.get('/summary', A(async (req, res) => {
  const r = (await q(`select
    (select count(*)::int from users where not is_admin) users,
    (select count(*)::int from driver_profiles where status = 'approved') drivers,
    (select count(*)::int from users where pax_status = 'pending') + (select count(*)::int from driver_profiles where status = 'pending') reviews,
    (select count(*)::int from trips where status in ('active','started') and dep_at > now() - interval '1 day') trips,
    (select count(*)::int from bookings where status = 'confirmado') bookings,
    (select count(*)::int from payments where status = 'pendiente') pay_pending,
    (select coalesce(sum(amount),0)::float from payments where status = 'confirmado') revenue,
    (select count(*)::int from incidents where status = 'abierto') incidents`)).rows[0];
  res.json(r);
}));

admin.get('/reviews', A(async (req, res) => {
  const out = [];
  const pax = await q(`select * from users where pax_status = 'pending' order by id`);
  pax.rows.forEach(u => out.push({ userId: String(u.id), role: 'pasajero', name: u.name, email: u.email, phone: u.phone, dni: u.dni,
    emerg: u.emerg_name ? u.emerg_name + ' · ' + u.emerg_phone : null, files: { Selfie: fileUrl(u.selfie_file_id), 'Foto del DNI': fileUrl(u.dni_file_id) } }));
  const drv = await q(`select u.*, dp.* , u.id as id from driver_profiles dp join users u on u.id = dp.user_id where dp.status = 'pending' order by dp.submitted_at`);
  drv.rows.forEach(u => out.push({ userId: String(u.id), role: 'conductor', name: u.name, email: u.email, phone: u.phone, dni: u.dni,
    data: { Licencia: u.lic_num + ' · ' + u.lic_cat, Vehículo: u.vtype + ' · ' + u.model + ' · ' + u.plate, 'SOAT hasta': u.soat_until + (u.rt_ok ? ' · revisión técnica vigente' : ''), Cobro: [u.yape_phone && 'Yape ' + u.yape_phone, u.plin_phone && 'Plin ' + u.plin_phone].filter(Boolean).join(' · ') },
    files: { Selfie: fileUrl(u.selfie_file_id), 'Foto del DNI': fileUrl(u.dni_file_id), Licencia: fileUrl(u.lic_file_id), SOAT: fileUrl(u.soat_file_id), Antecedentes: fileUrl(u.ant_file_id), 'Vehículo exterior': fileUrl(u.veh_ext_file_id), 'Vehículo interior': fileUrl(u.veh_int_file_id), Maletera: fileUrl(u.veh_bag_file_id) } }));
  res.json({ reviews: out });
}));

admin.post('/review', A(async (req, res) => {
  const uid = +req.body.userId, role = req.body.role === 'conductor' ? 'conductor' : 'pasajero', ok = req.body.decision === 'approve';
  const note = S(req.body.note).trim().slice(0, 200) || null;
  if (!ok && !note) fail(400, 'Escribe el motivo del rechazo para que el usuario pueda corregirlo.');
  const st = ok ? 'approved' : 'rejected';
  const r = role === 'conductor'
    ? await q(`update driver_profiles set status = $2, review_note = $3, reviewed_at = now() where user_id = $1 and status = 'pending' returning user_id`, [uid, st, ok ? null : note])
    : await q(`update users set pax_status = $2, pax_note = $3 where id = $1 and pax_status = 'pending' returning id`, [uid, st, ok ? null : note]);
  if (!r.rowCount) fail(409, 'Esta solicitud ya fue revisada.');
  const u = (await q('select email, name from users where id = $1', [uid])).rows[0];
  const what = role === 'conductor' ? 'cuenta de conductor' : 'verificación de pasajero';
  sendMail(u.email, ok ? 'Aprobamos tu ' + what : 'Revisa tu ' + what, ok ? 'Verificación aprobada' : 'Verificación rechazada',
    ok ? `<p>Hola ${esc(firstName(u.name))}, ya aprobamos tu ${what}.${role === 'conductor' ? ' Ya puedes publicar viajes.' : ' Ahora tienes la insignia «Pasajero confiable».'}</p>`
       : `<p>Hola ${esc(firstName(u.name))}, no pudimos aprobar tu ${what}.</p><p>Motivo: ${esc(note)}</p><p>Corrígelo en la app y vuelve a enviarlo.</p>`);
  res.json({ ok: true });
}));

admin.get('/users', A(async (req, res) => {
  const term = '%' + S(req.query.q).trim().toLowerCase() + '%';
  const r = await q(`select u.id, u.name, u.email, u.phone, u.dni, u.is_admin, u.blocked, u.blocked_reason, u.pax_status, dp.status as drv_status, u.created_at
    from users u left join driver_profiles dp on dp.user_id = u.id
    where lower(u.name) like $1 or lower(u.email) like $1 or coalesce(u.dni,'') like $1 or coalesce(u.phone,'') like $1 order by u.created_at desc limit 60`, [term]);
  res.json({ users: r.rows.map(u => ({ id: String(u.id), name: u.name, email: u.email, phone: u.phone, dni: u.dni, isAdmin: u.is_admin, blocked: u.blocked, reason: u.blocked_reason, pax: u.pax_status, driver: u.drv_status, at: u.created_at })) });
}));
admin.post('/users/:id/block', A(async (req, res) => {
  const id = +req.params.id, block = !!req.body.blocked;
  if (id === req.user.id) fail(400, 'No puedes bloquear tu propia cuenta.');
  const u = (await q('select is_admin from users where id = $1', [id])).rows[0];
  if (!u) fail(404, 'No existe ese usuario.'); if (u.is_admin) fail(400, 'No se puede bloquear a un administrador.');
  const reason = S(req.body.reason).trim().slice(0, 160) || null;
  if (block && !reason) fail(400, 'Escribe el motivo del bloqueo.');
  await q('update users set blocked = $2, blocked_reason = $3 where id = $1', [id, block, block ? reason : null]);
  if (block) {
    await q(`update bookings set status = 'cancelado' where user_id = $1 and status = 'hold'`, [id]);
    await q(`update booking_seats set active = false, released_at = now() where booking_id in (select id from bookings where user_id = $1 and status = 'cancelado') and active`, [id]);
    const ts = await q(`select id from trips where driver_id = $1 and status in ('active','started')`, [id]);
    for (const t of ts.rows) await cancelTrip(t.id, 'cuenta del conductor suspendida');
  }
  res.json({ ok: true });
}));

admin.get('/trips', A(async (req, res) => {
  const r = await q(`select ${TRIP_COLS}, u.name as dname,
     (select count(*)::int from booking_seats bs join bookings b on b.id = bs.booking_id where bs.trip_id = t.id and bs.active and b.status = 'confirmado') as sold
     from trips t join users u on u.id = t.driver_id order by t.dep_at desc limit 50`);
  res.json({ trips: r.rows.map(x => Object.assign(tripDto(x), { driverName: x.dname, sold: x.sold })) });
}));
admin.post('/trips/:id/cancel', A(async (req, res) => {
  if (!(await cancelTrip(+req.params.id || 0, S(req.body.reason).slice(0, 120) || 'decisión de la central'))) fail(409, 'Este viaje ya no se puede cancelar.');
  res.json({ ok: true });
}));

admin.get('/payments', A(async (req, res) => {
  const st = ['pendiente', 'confirmado', 'rechazado'].includes(req.query.status) ? req.query.status : null;
  const r = await q(`select p.id, p.method, p.amount, p.operation_no, p.status, p.note, p.created_at, p.capture_file_id, b.code, u.name as pname, d.name as dname, t.trip_date, t.dep_time, t.from_off
    from payments p join bookings b on b.id = p.booking_id join users u on u.id = b.user_id join trips t on t.id = b.trip_id join users d on d.id = t.driver_id
    ${st ? 'where p.status = $1' : ''} order by p.created_at desc limit 60`, st ? [st] : []);
  res.json({ payments: r.rows.map(p => ({ id: String(p.id), method: p.method, amount: p.amount, opNo: p.operation_no, status: p.status, note: p.note, at: p.created_at, capture: fileUrl(p.capture_file_id), code: p.code, passenger: p.pname, driver: p.dname, trip: OFF[p.from_off] + ' → ' + OFF[p.from_off === 'tru' ? 'chi' : 'tru'] + ' · ' + p.trip_date + ' ' + p.dep_time })) });
}));

admin.get('/incidents', A(async (req, res) => {
  const r = await q(`select i.*, u.name as uname, u.phone as uphone, t.veh_plate, t.trip_date, t.dep_time, t.from_off, d.name as dname
    from incidents i left join users u on u.id = i.user_id left join trips t on t.id = i.trip_id left join users d on d.id = t.driver_id order by (i.status = 'abierto') desc, i.created_at desc limit 60`);
  res.json({ incidents: r.rows.map(i => ({ id: String(i.id), kind: i.kind, status: i.status, issues: i.issues, lat: i.lat, lon: i.lon, at: i.created_at, user: i.uname, phone: i.uphone, driver: i.dname, plate: i.veh_plate,
    trip: i.from_off ? OFF[i.from_off] + ' → ' + OFF[i.from_off === 'tru' ? 'chi' : 'tru'] + ' · ' + i.trip_date + ' ' + i.dep_time : null })) });
}));
admin.post('/incidents/:id/resolve', A(async (req, res) => {
  await q(`update incidents set status = 'resuelto', resolved_by = $2, resolved_at = now() where id = $1 and status = 'abierto'`, [+req.params.id || 0, req.user.id]);
  res.json({ ok: true });
}));

/* ================= archivos estáticos y errores ================= */
api.use((req, res) => res.status(404).json({ error: 'No existe.' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], setHeaders: (res, p) => { if (/sw\.js$|index\.html$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande.' });
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'Datos no válidos.' });
  if (err.expose && err.status) return res.status(err.status).json({ error: err.message });
  if (err instanceof HttpError) return res.status(err.status).json(Object.assign({ error: err.message }, err.extra || {}));
  console.error('[error]', req.method, req.path, err);
  res.status(500).json({ error: 'Algo salió mal de nuestro lado. Inténtalo otra vez.' });
});

/* ================= arranque ================= */
async function seedAdmin() {
  const email = S(process.env.ADMIN_EMAIL).trim().toLowerCase(), pass = S(process.env.ADMIN_PASSWORD);
  if (!email || !pass) { console.warn('[admin] Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el administrador.'); return; }
  const u = (await q('select id, pass_hash, is_admin from users where lower(email) = $1', [email])).rows[0];
  if (!u) { await q('insert into users (email, name, pass_hash, is_admin) values ($1,$2,$3,true)', [email, process.env.ADMIN_NAME || 'Administrador VIP', await bcrypt.hash(pass, 10)]); console.log('[admin] creado: ' + email); }
  else if (!u.is_admin || !(await bcrypt.compare(pass, u.pass_hash))) { await q('update users set is_admin = true, pass_hash = $2 where id = $1', [u.id, await bcrypt.hash(pass, 10)]); console.log('[admin] actualizado: ' + email); }
}

async function main() {
  await migrate();
  await seedAdmin();
  await runJobs();
  setInterval(() => runJobs().catch(e => console.error('[jobs]', e.message)), 30000).unref();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('VIP Ruta Segura en ' + APP_URL + ' (puerto ' + port + ')'));
}
if (require.main === module) main().catch(e => { console.error('No se pudo iniciar:', e.message); process.exit(1); });
module.exports = { app, runJobs, main };
