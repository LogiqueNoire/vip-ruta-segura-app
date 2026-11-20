'use strict';

require('dotenv').config();

const MAKE_WEBHOOK_URL = String(process.env.MAKE_WEBHOOK_URL || '').trim();
const READ_WEBHOOK_URL = String(process.env.SHEETS_READ_WEBHOOK_URL || '').trim();
const EXECUTE = process.argv.includes('--execute');
const CONFIRMED = process.argv.includes('--confirm-fictional-data');

const TABLES = [
  {
    name: 'usuarios',
    sql: `select u.id::text as id, u.id::text as request_id, u.email, u.dni, u.name, u.phone,
        u.is_admin, u.blocked, u.blocked_reason, u.emerg_name, u.emerg_phone,
        u.pax_status, u.pax_note, u.created_at,
        case when dp.user_id is null then 'pasajero' else 'conductor' end as role,
        'active'::text as status,
        dp.status as drv_status, dp.review_note as drv_note, dp.lic_num, dp.lic_cat,
        dp.vtype, dp.model, dp.plate, dp.color, dp.soat_until::text as soat_until, dp.rt_ok,
        dp.yape_phone, dp.plin_phone, dp.submitted_at, dp.reviewed_at
      from users u left join driver_profiles dp on dp.user_id = u.id order by u.id`
  },
  {
    name: 'viajes',
    sql: `select id::text as id, id::text as request_id, driver_id::text as driver_id,
        from_off, trip_date::text as trip_date, dep_time, dep_at, price, seats,
        vtype, veh_model, veh_plate, veh_color, status, started_at, finished_at, created_at
      from trips order by id`
  },
  {
    name: 'reservas',
    sql: `select id::text as id, id::text as request_id, code, trip_id::text as trip_id,
        user_id::text as user_id, status, hold_until, subtotal, promo_name, promo_pct,
        total, rated, created_at from bookings order by id`
  },
  {
    name: 'asientos_reserva',
    sql: `select id::text as id, id::text as request_id, booking_id::text as booking_id,
        trip_id::text as trip_id, seat, active, boarded_at, released_at, noshow, pax_rating
      from booking_seats order by id`
  },
  {
    name: 'pagos',
    sql: `select id::text as id, id::text as request_id, booking_id::text as booking_id,
        method, amount, operation_no, status, note, decided_by::text as decided_by, decided_at, created_at
      from payments order by id`
  },
  {
    name: 'resenas',
    sql: `select id::text as id, id::text as request_id, booking_id::text as booking_id,
        trip_id::text as trip_id, driver_id::text as driver_id, passenger_id::text as passenger_id,
        stars, tags, flags, comment, created_at from reviews order by id`
  },
  {
    name: 'incidentes',
    sql: `select id::text as id, id::text as request_id, kind, trip_id::text as trip_id,
        user_id::text as user_id, booking_id::text as booking_id, issues, lat, lon, status,
        resolved_by::text as resolved_by, resolved_at, created_at from incidents order by id`
  },
  {
    name: 'ubicaciones_en_vivo',
    sql: `select trip_id::text as id, trip_id::text as request_id, trip_id::text as trip_id,
        lat, lon, speed_kmh, updated_at from live_locations order by trip_id`
  }
];

const { pool } = require('../db');

async function loadSnapshot() {
  const snapshot = [];
  for (const table of TABLES) {
    const result = await pool.query(table.sql);
    snapshot.push({ name: table.name, rows: result.rows });
  }
  return snapshot;
}

async function sendSnapshot(snapshot) {
  for (const table of snapshot) {
    let sent = 0;
    for (const row of table.rows) {
      const response = await fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tabla: table.name, ...row, timestamp: new Date().toISOString() })
      });
      if (!response.ok) throw new Error(`Make rechazó ${table.name} id=${row.id}: HTTP ${response.status}`);
      sent++;
    }
    console.log(`[sync] ${table.name}: ${sent} registro(s) enviados`);
  }
}

async function main() {
  try {
    const snapshot = await loadSnapshot();
    snapshot.forEach(table => console.log(`[sync] ${table.name}: ${table.rows.length} registro(s) en PostgreSQL`));

    if (!EXECUTE) {
      console.log('[sync] Vista previa solamente. No se envió información a Make.');
      console.log('Para ejecutar: npm run sync:make:init -- --execute --confirm-fictional-data');
      return;
    }
    if (!CONFIRMED) throw new Error('Confirma que los datos son ficticios con --confirm-fictional-data.');
    if (!MAKE_WEBHOOK_URL) throw new Error('Falta MAKE_WEBHOOK_URL.');
    if (MAKE_WEBHOOK_URL === READ_WEBHOOK_URL) throw new Error('El webhook de escritura no puede ser el webhook de lectura.');

    console.log('[sync] Se omiten pass_hash, códigos de verificación y archivos/binarios.');
    await sendSnapshot(snapshot);
    console.log('[sync] Carga inicial terminada. Si Make falla a mitad, puedes volver a ejecutarla: el upsert por id evita duplicados.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('[sync] No se completó la carga:', error.message);
  process.exitCode = 1;
});
