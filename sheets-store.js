'use strict';

const LIBRO_ID = process.env.SHEETS_LIBRO_ID || '1N6_HaUEenitqv11YvTB2sJiQjJ2yfHtUapm2k7g-fcY';
const READ_WEBHOOK_URL = String(process.env.SHEETS_READ_WEBHOOK_URL || '').trim();
const GIDS = Object.freeze({
  usuarios: 0,
  codigos_correo: 1940336707,
  viajes: 1230547018,
  reservas: 1656189283,
  asientos_reserva: 2021609011,
  pagos: 1514281011,
  reseñas: 1557130465,
  incidentes: 1198015377,
  ubicaciones_en_vivo: 651696487
});

const cache = new Map();

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some(v => v !== '')) rows.push(row);
  const headers = rows.shift() || [];
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}

async function leerHoja(nombre) {
  const gid = GIDS[nombre];
  if (gid == null) throw new Error(`Hoja no configurada: ${nombre}`);
  const hit = cache.get(nombre);
  if (hit && Date.now() - hit.at < 5000) return hit.rows;
  const url = `https://docs.google.com/spreadsheets/d/${LIBRO_ID}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sheets ${nombre}: HTTP ${response.status}`);
  const rows = parseCsv(await response.text());
  cache.set(nombre, { at: Date.now(), rows });
  return rows;
}

const texto = value => String(value ?? '').trim();
const numero = value => value === '' || value == null ? null : Number(value);

async function leerDesdeMake(payload) {
  if (!READ_WEBHOOK_URL || READ_WEBHOOK_URL === String(process.env.MAKE_WEBHOOK_URL || '').trim()) return null;
  try {
    const response = await fetch(READ_WEBHOOK_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operacion: 'buscar', ...payload })
    });
    if (!response.ok) throw new Error(`Make lectura HTTP ${response.status}`);
    const data = await response.json();
    const result = data?.usuario ?? data?.user ?? data?.viajes ?? data?.results ?? data?.data ?? data;
    if (payload.tabla === 'usuarios' && result && !Array.isArray(result) && !texto(result.id) && !texto(result.email)) return null;
    return result;
  } catch (error) {
    console.error('[sheets] lectura Make falló; uso CSV público:', error.message);
    return null;
  }
}

async function buscarUsuarioPorId(id) {
  const remoto = await leerDesdeMake({ tabla: 'usuarios', id });
  if (remoto && !Array.isArray(remoto)) return remoto;
  const rows = await leerHoja('usuarios');
  return rows.find(x => texto(x.id) === texto(id)) || null;
}

async function buscarUsuarioPorCorreo(email) {
  const remoto = await leerDesdeMake({ tabla: 'usuarios', email });
  if (remoto && !Array.isArray(remoto)) return remoto;
  const rows = await leerHoja('usuarios');
  return rows.find(x => texto(x.email).toLowerCase() === texto(email).toLowerCase()) || null;
}

async function listarViajes(date, from) {
  const remoto = await leerDesdeMake({ tabla: 'viajes', fecha: date, origen: from, from });
  if (Array.isArray(remoto)) return remoto.filter(x => x && (texto(x.id) || texto(x.trip_id) || texto(x.date) || texto(x.trip_date)));
  const rows = await leerHoja('viajes');
  return rows.filter(x => texto(x.date || x.trip_date) === texto(date) && texto(x.from || x.from_off) === texto(from) && ['active', 'started'].includes(texto(x.status || 'active'))).map(x => ({
    id: texto(x.id || x.request_id), date: texto(x.date || x.trip_date), time: texto(x.time || x.dep_time), from: texto(x.from || x.from_off),
    price: numero(x.price), seats: numero(x.seats) || 0, vtype: texto(x.vtype), status: texto(x.status || 'active'), dep_at: texto(x.dep_at),
    driver_id: texto(x.driver_id), veh_model: texto(x.veh_model), veh_plate: texto(x.veh_plate), veh_color: texto(x.veh_color), taken: 0
  }));
}

module.exports = { leerHoja, buscarUsuarioPorId, buscarUsuarioPorCorreo, listarViajes };
