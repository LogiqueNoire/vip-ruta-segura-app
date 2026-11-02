'use strict';
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// date -> 'YYYY-MM-DD' (sin convertir a zona horaria), numeric/bigint -> number
types.setTypeParser(1082, v => v);
types.setTypeParser(1700, v => parseFloat(v));
types.setTypeParser(20, v => parseInt(v, 10));

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en el .env (cadena de conexión de Neon).');
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: true },
  max: 8
});
pool.on('error', e => console.error('[pg]', e.message));

const q = (text, params) => pool.query(text, params);

// Ejecuta fn(client) dentro de una transacción.
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    try { await c.query('rollback'); } catch (_) {}
    throw e;
  } finally { c.release(); }
}

async function migrate() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
}

module.exports = { pool, q, tx, migrate };
