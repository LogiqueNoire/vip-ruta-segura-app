'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
process.env.SHEETS_READ_WEBHOOK_URL = 'https://make.example.test/read';
const { normalizarFilas, leerTabla, listarViajes, buscarUsuarioPorId, buscarUsuarioPorCorreo } = require('../sheets-store');

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

const sheetFormats = [
  {
    table:'reservas',
    columns:['id','code','trip_id','user_id','status','hold_until','subtotal','promo_name','promo_pct','total','rated','created_at'],
    values:['3','VR003','3','3','confirmado','','45','','0','45','FALSE','2026-11-20T04:19:00Z'],
    field:'code',
    value:'VR003'
  },
  {
    table:'asientos_reserva',
    columns:['id','booking_id','trip_id','seat','active','boarded_at','released_at','noshow','pax_rating'],
    values:['3','3','3','1','TRUE','','','FALSE',''],
    field:'seat',
    value:'1'
  },
  {
    table:'pagos',
    columns:['id','booking_id','method','amount','operation_no','status','note','decided_by','decided_at','created_at'],
    values:['3','3','yape','45','DEMO-OP003','confirmado','Pago simulado','2','2026-11-19T04:30:00Z','2026-11-19T04:25:00Z'],
    field:'operation_no',
    value:'DEMO-OP003'
  },
  {
    table:'resenas',
    columns:['id','booking_id','trip_id','driver_id','passenger_id','stars','tags','flags','comment','created_at'],
    values:['3','3','3','2','3','5','Puntual, Manejo seguro','','Viaje cómodo','2026-11-20T20:00:00Z'],
    field:'stars',
    value:'5'
  },
  {
    table:'incidentes',
    columns:['id','kind','trip_id','user_id','booking_id','issues','lat','lon','status','resolved_by','resolved_at','created_at'],
    values:['3','sos','3','3','','','','','abierto','','','2026-11-19T23:00:00Z'],
    field:'kind',
    value:'sos'
  },
  {
    table:'ubicaciones_en_vivo',
    columns:['trip_id','lat','lon','speed_kmh','updated_at'],
    values:['3','-8.1040','-79.0300','0','2026-11-19T23:23:00Z'],
    field:'trip_id',
    value:'3'
  }
];

for (const format of sheetFormats) {
  test(`maps ${format.table} rows with its current sheet columns`, () => {
    const [row] = normalizarFilas(format.table, [positionalRow(format.values)]);
    const [rowWithHeaders] = normalizarFilas(format.table, [
      positionalRow(format.columns),
      positionalRow(format.values)
    ]);

    assert.equal(row[format.field], format.value);
    assert.deepEqual(rowWithHeaders, row);
  });
}

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

test('finds a user by a non-numeric Make ID', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const id = 'verificacion-usuario-002';
  const user = { id, email:'ejemplo@gmail.com', name:'Usuario Demo' };
  const requests = [];
  global.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    return new Response(JSON.stringify(payload.id ? [] : [user]), { status:200, headers:{'content-type':'application/json'} });
  };

  const found = await buscarUsuarioPorId(id);

  assert.equal(found.id, id);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].id, id);
  assert.equal(requests[1].id, undefined);
});

test('reads the password field from the sheet when Make omits it', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const email = 'demo@example.test';
  const columns = ['id','email','dni','name','phone','pass_hash','is_admin','blocked','blocked_reason','emerg_name','emerg_phone','pax_status','pax_note','created_at'];
  const values = ['3',email,'70000003','Demo User','900000003','demo-plaintext','FALSE','FALSE','','Contact','911111113','activo','', '2026-11-19T05:10:00Z'];
  global.fetch = async (_url, options) => {
    if (options && options.method === 'POST') {
      return new Response(JSON.stringify([{ id:'3', email, name:'Demo User', role:'pasajero', status:'activo' }]), { status:200, headers:{'content-type':'application/json'} });
    }
    return new Response([columns.join(','), values.join(',')].join('\n'), { status:200, headers:{'content-type':'text/csv'} });
  };

  const user = await buscarUsuarioPorCorreo(email);

  assert.equal(user.pass_hash, 'demo-plaintext');
});

test('uses the ASCII reviews table name when reading from Make', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify([]), { status:200, headers:{'content-type':'application/json'} });
  };

  const rows = await leerTabla('resenas');

  assert.deepEqual(request, { operacion:'buscar', tabla:'resenas' });
  assert.deepEqual(rows, []);
});
