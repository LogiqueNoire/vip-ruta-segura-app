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
const booleano = value => ['true', '1', 'sí', 'si'].includes(texto(value).toLowerCase());
const lista = value => Array.isArray(value) ? value : texto(value).split(',').map(x => x.trim()).filter(Boolean);
const ordenarFechaDesc = (a, b, campo) => new Date(b[campo] || 0) - new Date(a[campo] || 0);

const COLUMNAS = Object.freeze({
  usuarios: [
    ['id','email','dni','name','phone','pass_hash','is_admin','blocked','blocked_reason','emerg_name','emerg_phone','pax_status','pax_note','created_at'],
    ['id','email','dni','name','phone','role','status','created_at'],
    ['id','request_id','email','dni','name','phone','pass_hash','is_admin','blocked','blocked_reason','emerg_name','emerg_phone','pax_status','pax_note','created_at','role','status']
  ],
  codigos_correo: [['id','request_id','email','code_hash','expires_at','attempts','used','created_at']],
  viajes: [
    ['id','driver_id','from_off','trip_date','dep_time','dep_at','price','seats','vtype','veh_model','veh_plate','veh_color','status','started_at','finished_at','created_at'],
    ['id','request_id','driver_id','from','date','time','price','seats','vtype','veh_model','veh_plate','veh_color','dep_at','status','started_at','finished_at','created_at']
  ],
  reservas: [['id','request_id','code','trip_id','user_id','status','hold_until','subtotal','promo_name','promo_pct','total','rated','created_at']],
  asientos_reserva: [['id','request_id','booking_id','trip_id','seat','active','boarded_at','released_at','noshow','pax_rating']],
  pagos: [['id','request_id','booking_id','method','amount','operation_no','status','note','decided_by','decided_at','created_at']],
  reseñas: [['id','request_id','booking_id','trip_id','driver_id','passenger_id','stars','tags','flags','comment','created_at']],
  incidentes: [['id','request_id','kind','trip_id','user_id','booking_id','issues','lat','lon','status','resolved_by','resolved_at','created_at']],
  ubicaciones_en_vivo: [['id','request_id','trip_id','lat','lon','speed_kmh','updated_at']]
});

function valoresPosicionales(fila) {
  if (Array.isArray(fila)) return fila;
  if (!fila || typeof fila !== 'object') return null;
  const keys = Object.keys(fila);
  if (!keys.length || !keys.every(k => /^\d+$/.test(k))) return null;
  const length = Math.max(...keys.map(Number)) + 1;
  if (keys.length !== length) return null;
  return Array.from({ length }, (_, i) => fila[String(i)]);
}

function nombreColumna(value) {
  return texto(value).replace(/^\uFEFF/, '').toLowerCase();
}

function normalizarFilas(nombre, filas) {
  const variantes = COLUMNAS[nombre] || [];
  if (!Array.isArray(filas)) throw new Error(`Make devolvió un formato de lectura inválido para ${nombre}.`);
  const primeraFila = filas.find(fila => fila != null);
  const encabezados = valoresPosicionales(primeraFila);
  const usaEncabezados = encabezados && encabezados.length > 1 &&
    encabezados.map(nombreColumna).includes('id') &&
    encabezados.some(value => ['email','trip_date','booking_id','created_at'].includes(nombreColumna(value)));
  const columnas = usaEncabezados ? encabezados.map(nombreColumna) : null;
  const datos = usaEncabezados ? filas.slice(filas.indexOf(primeraFila) + 1) : filas;

  return datos.filter(fila => fila != null).map(fila => {
    const posicionales = valoresPosicionales(fila);
    if (posicionales) {
      const cols = columnas || variantes.find(v => v.length === posicionales.length);
      if (!cols || cols.length !== posicionales.length) {
        throw new Error(`Make devolvió ${posicionales.length} columnas no reconocidas para ${nombre}.`);
      }
      return Object.fromEntries(cols.map((col, i) => [col, posicionales[i]]));
    }
    if (typeof fila !== 'object' || !Object.keys(fila).length) {
      throw new Error(`Make devolvió una fila vacía o inválida para ${nombre}.`);
    }
    return fila;
  });
}

function filasRespuesta(remoto, nombre) {
  if (Array.isArray(remoto)) return normalizarFilas(nombre, remoto);
  if (remoto && typeof remoto === 'object') {
    for (const key of ['results','data','rows',nombre]) {
      if (Array.isArray(remoto[key])) return normalizarFilas(nombre, remoto[key]);
    }
    if (Object.keys(remoto).length) return normalizarFilas(nombre, [remoto]);
  }
  if (remoto == null || remoto === '') return [];
  throw new Error(`Make devolvió un formato de lectura inválido para ${nombre}.`);
}

async function leerDesdeMake(payload) {
  if (!READ_WEBHOOK_URL) throw new Error('Falta SHEETS_READ_WEBHOOK_URL para consultar datos en Make.');
  if (READ_WEBHOOK_URL === String(process.env.MAKE_WEBHOOK_URL || '').trim()) throw new Error('El webhook de lectura debe ser distinto al webhook de escritura.');
  const response = await fetch(READ_WEBHOOK_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operacion: 'buscar', ...payload })
  });
  if (!response.ok) throw new Error(`Make lectura HTTP ${response.status}`);
  const raw = await response.text();
  if (!raw.trim()) return [];
  let data;
  try { data = JSON.parse(raw); } catch (_) { throw new Error('Make lectura devolvió una respuesta no JSON.'); }
  const result = data?.usuario ?? data?.user ?? data?.usuarios ?? data?.viajes ?? data?.results ?? data?.rows ?? data?.data ?? data;
  if (data?.ok === false || data?.error) throw new Error('Make rechazó la lectura solicitada.');
  return result;
}

function valorFila(fila, nombre) {
  return fila && Object.prototype.hasOwnProperty.call(fila, nombre) ? fila[nombre] : '';
}

function coincide(fila, filtros) {
  return Object.entries(filtros || {}).every(([campo, esperado]) => {
    if (esperado == null || esperado === '') return true;
    return texto(valorFila(fila, campo)).toLowerCase() === texto(esperado).toLowerCase();
  });
}

// Lector común para las tablas persistidas en Sheets. Los errores de Make no se convierten en filas vacías.
async function leerTabla(nombre, filtros = {}) {
  const remoto = await leerDesdeMake({ tabla: nombre, ...filtros });
  return filasRespuesta(remoto, nombre).filter(fila => coincide(fila, filtros));
}

async function buscarUsuarioPorId(id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) return null;
  const remoto = await leerDesdeMake({ tabla: 'usuarios', id });
  const rows = filasRespuesta(remoto, 'usuarios');
  const found = rows.find(x => texto(x.id || x.request_id) === texto(id));
  if (found) return found;
  return (await leerTabla('usuarios')).find(x => texto(x.id || x.request_id) === texto(id)) || null;
}

async function buscarUsuarioPorCorreo(email) {
  if (!texto(email)) return null;
  const remoto = await leerDesdeMake({ tabla: 'usuarios', email });
  const rows = filasRespuesta(remoto, 'usuarios');
  const found = rows.find(x => texto(x.email).toLowerCase() === texto(email).toLowerCase());
  if (found) return found;
  return (await leerTabla('usuarios')).find(x => texto(x.email).toLowerCase() === texto(email).toLowerCase()) || null;
}

async function listarViajes(date, from) {
  const remoto = await leerDesdeMake({ tabla: 'viajes' });
  const remotos = filasRespuesta(remoto, 'viajes');
  return remotos.filter(x => texto(x.id || x.trip_id || x.date || x.trip_date))
    .map(x => {
      const time = texto(x.time || x.dep_time);
      const m = /^(\d{1,2}):([0-5]\d)$/.exec(time);
      return {
        ...x,
        id: Number(x.id || x.trip_id || x.request_id),
        date: texto(x.date || x.trip_date),
        time: m && Number(m[1]) < 24 ? m[1].padStart(2, '0') + ':' + m[2] : time,
        from: texto(x.from || x.from_off),
        price: numero(x.price),
        seats: numero(x.seats) || 0,
        driver_id: Number(x.driver_id),
        taken: numero(x.taken) || 0
      };
    })
    .filter(x => Number.isSafeInteger(x.id) && x.id > 0 && Number.isSafeInteger(x.driver_id) && x.driver_id > 0 &&
      x.date === texto(date) && x.from === texto(from) && ['active', 'started'].includes(texto(x.status || 'active')));
}

async function listarReservasUsuario(userId, onlyId) {
  const reservas = await leerTabla('reservas', { user_id: userId });
  const filtradas = onlyId ? reservas.filter(x => texto(x.id) === texto(onlyId)) : reservas;
  if (!filtradas.length) return { encontrados: false, drivers: {}, bookings: [] };
  const [viajes, asientos, pagos, usuarios] = await Promise.all([
    leerTabla('viajes'), leerTabla('asientos_reserva'), leerTabla('pagos'), leerTabla('usuarios')
  ]);
  const porViaje = new Map(viajes.map(x => [texto(x.id || x.request_id), x]));
  const porUsuario = new Map(usuarios.map(x => [texto(x.id || x.request_id), x]));
  const porPago = new Map(pagos.map(x => [texto(x.booking_id), x]));
  const drivers = {};
  const bookings = filtradas.map(b => {
    const viaje = porViaje.get(texto(b.trip_id)) || {};
    const conductor = porUsuario.get(texto(viaje.driver_id)) || {};
    if (viaje.driver_id) drivers[texto(viaje.driver_id)] = conductor;
    const seats = asientos.filter(x => texto(x.booking_id) === texto(b.id) && (texto(x.active) === '' || booleano(x.active) || booleano(x.noshow)))
      .map(x => numero(x.seat)).filter(Number.isFinite).sort((a, z) => a - z);
    const pago = porPago.get(texto(b.id)) || {};
    const reserva = {
      id: numero(b.id) ?? texto(b.id), code: texto(b.code), trip_id: numero(b.trip_id) ?? texto(b.trip_id),
      status: texto(b.status), hold_until: b.hold_until || null, subtotal: numero(b.subtotal) || 0,
      promo_name: b.promo_name || null, promo_pct: numero(b.promo_pct) || 0, total: numero(b.total) || 0,
      rated: booleano(b.rated), created_at: b.created_at || null
    };
    const trip = {
      id: numero(viaje.id || viaje.request_id) ?? texto(viaje.id || viaje.request_id),
      date: texto(viaje.date || viaje.trip_date), time: texto(viaje.time || viaje.dep_time),
      from: texto(viaje.from || viaje.from_off), to: texto(viaje.from || viaje.from_off) === 'tru' ? 'chi' : 'tru',
      price: numero(viaje.price) || 0, seats: numero(viaje.seats) || 0, vtype: texto(viaje.vtype),
      status: texto(viaje.status || 'active'), dep_at: viaje.dep_at || null,
      driver_id: numero(viaje.driver_id) ?? texto(viaje.driver_id), veh_model: texto(viaje.veh_model || viaje.model),
      veh_plate: texto(viaje.veh_plate || viaje.plate), veh_color: texto(viaje.veh_color || viaje.color), taken: 0
    };
    return { reserva, viaje: trip, conductor, pago, seats, asientos: asientos.filter(x => texto(x.booking_id) === texto(b.id)) };
  });
  return { encontrados: true, drivers, bookings };
}

async function listarResenasConductor(driverId) {
  const [resenas, usuarios] = await Promise.all([leerTabla('reseñas', { driver_id: driverId }), leerTabla('usuarios')]);
  const nombres = new Map(usuarios.map(x => [texto(x.id || x.request_id), x.name]));
  return resenas.sort((a, b) => ordenarFechaDesc(a, b, 'created_at')).map(x => ({
    ...x, stars: numero(x.stars) || 0, tags: lista(x.tags), flags: lista(x.flags),
    name: nombres.get(texto(x.passenger_id)) || ''
  }));
}

async function listarPagos(filtros = {}) {
  return leerTabla('pagos', filtros);
}

async function listarIncidentes(filtros = {}) {
  return leerTabla('incidentes', filtros);
}

async function listarPagosPanel(estado = '') {
  const pagos = await leerTabla('pagos', estado ? { status: estado } : {});
  const [reservas, viajes, usuarios] = await Promise.all([
    leerTabla('reservas'), leerTabla('viajes'), leerTabla('usuarios')
  ]);
  const porReserva = new Map(reservas.map(x => [texto(x.id), x]));
  const porViaje = new Map(viajes.map(x => [texto(x.id || x.request_id), x]));
  const porUsuario = new Map(usuarios.map(x => [texto(x.id || x.request_id), x]));
  return pagos.map(p => {
    const b = porReserva.get(texto(p.booking_id)) || {};
    const t = porViaje.get(texto(b.trip_id)) || {};
    const pasajero = porUsuario.get(texto(b.user_id)) || {};
    const conductor = porUsuario.get(texto(t.driver_id)) || {};
    return { pago: p, reserva: b, viaje: t, pasajero, conductor };
  });
}

async function listarIncidentesPanel() {
  const incidentes = await leerTabla('incidentes');
  const [viajes, usuarios] = await Promise.all([leerTabla('viajes'), leerTabla('usuarios')]);
  const porViaje = new Map(viajes.map(x => [texto(x.id || x.request_id), x]));
  const porUsuario = new Map(usuarios.map(x => [texto(x.id || x.request_id), x]));
  return incidentes.map(i => ({
    incidente: i,
    viaje: porViaje.get(texto(i.trip_id)) || {},
    usuario: porUsuario.get(texto(i.user_id)) || {},
    conductor: porUsuario.get(texto((porViaje.get(texto(i.trip_id)) || {}).driver_id)) || {}
  }));
}

module.exports = {
  leerHoja, leerTabla, buscarUsuarioPorId, buscarUsuarioPorCorreo, listarViajes,
  listarReservasUsuario, listarResenasConductor, listarPagos, listarIncidentes,
  listarPagosPanel, listarIncidentesPanel, normalizarFilas
};
