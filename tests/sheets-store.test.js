'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
process.env.SHEETS_READ_WEBHOOK_URL = 'https://make.example.test/read';
const { normalizarFilas, listarViajes, buscarUsuarioPorCorreo } = require('../sheets-store');

const tripColumns = [
  'id','driver_id','from_off','trip_date','dep_time','dep_at','price','seats',
  'vtype','veh_model','veh_plate','veh_color','status','started_at','finished_at','created_at'
];

function positionalRow(values) {
  return Object.fromEntries(values.map((value, index) => [String(index), value]));
}

test('maps Make numeric-key rows to the trip sheet columns', () => {
  const rows = [
    ['3','2','tru','2026-11-20','11:30','2026-11-20T16:30:00Z','45','8','minivan','Toyota Hiace','ABC-123','Blanco','active','','','2026-11-19T05:08:00Z'],
    ['4','2','chi','2026-11-20','17:30','2026-11-20T22:30:00Z','45','8','minivan','Toyota Hiace','ABC-123','Blanco','active','','','2026-11-19T05:08:00Z'],
    ['5','2','tru','2026-11-21','8:30','2026-11-21T13:30:00Z','45','8','minivan','Toyota Hiace','ABC-123','Blanco','active','','','2026-11-19T05:08:00Z'],
    ['6','2','chi','2026-11-21','13:00','2026-11-21T18:00:00Z','45','8','minivan','Toyota Hiace','ABC-123','Blanco','active','','','2026-11-19T05:08:00Z']
  ];

  const trips = normalizarFilas('viajes', rows.map(positionalRow));

  assert.equal(trips.length, 4);
  assert.equal(trips[0].id, '3');
  assert.equal(trips[0].from_off, 'tru');
  assert.equal(trips[2].dep_time, '8:30');
});

test('maps a header row followed by positional trip data', () => {
  const values = ['3','2','tru','2026-11-20','11:30','2026-11-20T16:30:00Z','45','8','minivan','Toyota Hiace','ABC-123','Blanco','active','','','2026-11-19T05:08:00Z'];
  const trips = normalizarFilas('viajes', [tripColumns, values]);

  assert.equal(trips.length, 1);
  assert.equal(trips[0].driver_id, '2');
  assert.equal(trips[0].trip_date, '2026-11-20');
});

test('maps the users sheet format and its email column', () => {
  const columns = ['id','email','dni','name','phone','pass_hash','is_admin','blocked','blocked_reason','emerg_name','emerg_phone','pax_status','pax_note','created_at'];
  const values = ['2','example@example.com','70000002','Demo User','900000002','$2b$10$hash','FALSE','FALSE','','Emergency','911111112','activo','','2026-11-19T04:30:00Z'];
  const [user] = normalizarFilas('usuarios', [positionalRow(values)]);

  assert.equal(user.id, '2');
  assert.equal(user.email, 'example@example.com');
  assert.equal(user.name, 'Demo User');
});

test('rejects unknown positional formats instead of treating them as empty records', () => {
  assert.throws(() => normalizarFilas('viajes', [positionalRow(['3','2','tru'])]), /columnas no reconocidas/);
  assert.throws(() => normalizarFilas('viajes', [{}]), /fila vacía o inválida/);
});

test('filters Make trip rows locally and normalizes single-digit hours', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const rows = [
    ['3','2','tru','2026-11-20','11:30','2026-11-20T16:30:00Z','45','8','minivan','Toyota Hiace','ABC-123','Blanco','active','','','2026-11-19T05:08:00Z'],
    ['4','2','chi','2026-11-20','17:30','2026-11-20T22:30:00Z','45','8','minivan','Toyota Hiace','ABC-123','Blanco','active','','','2026-11-19T05:08:00Z'],
    ['5','2','tru','2026-11-21','8:30','2026-11-21T13:30:00Z','45','8','minivan','Toyota Hiace','ABC-123','Blanco','active','','','2026-11-19T05:08:00Z']
  ];
  let request;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify(rows.map(positionalRow)), { status:200, headers:{'content-type':'application/json'} });
  };

  const trips = await listarViajes('2026-11-21', 'tru');

  assert.deepEqual(request, { operacion:'buscar', tabla:'viajes' });
  assert.equal(trips.length, 1);
  assert.equal(trips[0].id, 5);
  assert.equal(trips[0].time, '08:30');
});

test('falls back to the full users sheet when Make email filtering returns no rows', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const user = positionalRow(['2','ejemplo@gmail.com','70000002','Usuario Demo','900000002','$2b$10$hash','FALSE','FALSE','','Contacto','911111112','activo','','2026-11-19T04:30:00Z']);
  const requests = [];
  global.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    const rows = payload.email ? [] : [user];
    return new Response(JSON.stringify(rows), { status:200, headers:{'content-type':'application/json'} });
  };

  const found = await buscarUsuarioPorCorreo('ejemplo@gmail.com');

  assert.equal(requests.length, 2);
  assert.equal(found.id, '2');
  assert.equal(found.email, 'ejemplo@gmail.com');
});
