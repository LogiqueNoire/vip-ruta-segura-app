'use strict';

require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.error('No se permiten datos de demostración en producción.');
  process.exit(1);
}
if (!process.argv.includes('--confirm')) {
  console.error('Este comando agrega viajes a la base indicada por DATABASE_URL.');
  console.error('Para confirmar en un entorno de desarrollo: npm run seed:demo -- --confirm');
  process.exit(1);
}

const { q, tx, migrate, pool } = require('../db');

function limaDate(daysAhead) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const today = parts.reduce((date, part) => {
    if (part.type === 'year') date.year = part.value;
    if (part.type === 'month') date.month = part.value;
    if (part.type === 'day') date.day = part.value;
    return date;
  }, {});
  const date = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) + daysAhead));
  return date.toISOString().slice(0, 10);
}

async function seedDemoTrips() {
  await migrate();
  const driver = (await q(`select dp.user_id, dp.vtype, dp.model, dp.plate, dp.color
    from driver_profiles dp
    where dp.status = 'approved' and (nullif(dp.yape_phone, '') is not null or nullif(dp.plin_phone, '') is not null)
    order by dp.reviewed_at desc nulls last, dp.user_id
    limit 1`)).rows[0];
  if (!driver) throw new Error('Aprueba primero un conductor que tenga Yape o Plin configurado.');

  const capacity = { auto: 4, camioneta: 6, minivan: 8 }[driver.vtype];
  if (!capacity) throw new Error('El vehículo del conductor aprobado no tiene una capacidad válida.');
  const price = { auto: 60, camioneta: 50, minivan: 40 }[driver.vtype];
  const plan = [
    { from: 'tru', date: limaDate(2), time: '08:30' },
    { from: 'chi', date: limaDate(2), time: '17:30' },
    { from: 'tru', date: limaDate(3), time: '13:00' },
    { from: 'chi', date: limaDate(3), time: '07:00' }
  ];

  const result = await tx(async c => {
    const trips = [];
    for (const item of plan) {
      const existing = (await c.query(`select id from trips
        where driver_id = $1 and from_off = $2 and trip_date = $3::date and dep_time = $4
          and status in ('active','started') limit 1`,
      [driver.user_id, item.from, item.date, item.time])).rows[0];
      if (existing) {
        trips.push({ id: String(existing.id), ...item, existing: true });
        continue;
      }
      const inserted = (await c.query(`insert into trips
        (driver_id, from_off, trip_date, dep_time, dep_at, price, seats, vtype, veh_model, veh_plate, veh_color)
        values ($1,$2,$3::date,$4,($3::date + $4::time) at time zone 'America/Lima',$5,$6,$7,$8,$9,$10)
        returning id`,
      [driver.user_id, item.from, item.date, item.time, price, capacity, driver.vtype, driver.model, driver.plate, driver.color])).rows[0];
      trips.push({ id: String(inserted.id), ...item, existing: false });
    }
    return trips;
  });

  result.forEach(trip => {
    const route = trip.from === 'tru' ? 'Trujillo → Chiclayo' : 'Chiclayo → Trujillo';
    console.log(`${trip.existing ? 'Ya existía' : 'Creado'}: ${route} · ${trip.date} ${trip.time} · #${trip.id}`);
  });
  console.log('Los viajes están disponibles para reservas de pasajeros.');
}

seedDemoTrips()
  .catch(error => {
    console.error('No se pudieron crear los viajes de demostración:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
