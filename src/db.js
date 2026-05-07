const { Pool } = require('pg');
require('dotenv').config();

let pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'simipipe',
  user: process.env.PG_USER || undefined,
  password: process.env.PG_PASSWORD || undefined,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error:', err.message);
});

async function reconnect(config) {
  await pool.end();
  pool = new Pool({
    host: config.host || 'localhost',
    port: parseInt(config.port || '5432'),
    database: config.database || 'simipipe',
    user: config.user || undefined,
    password: config.password || undefined,
  });
  pool.on('error', (err) => {
    console.error('[DB] Unexpected error:', err.message);
  });
  // Verify connection
  await pool.query('SELECT 1');
}

// Infer PostgreSQL column type from JS values
function inferType(values) {
  for (const v of values) {
    if (v == null) continue;
    if (typeof v === 'number') return Number.isInteger(v) ? 'INTEGER' : 'NUMERIC';
    if (typeof v === 'boolean') return 'BOOLEAN';
    if (v instanceof Date) return 'TIMESTAMPTZ';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return 'TIMESTAMPTZ';
  }
  return 'TEXT';
}

// Ensure schema + table exist, auto-create from data shape
async function ensureTable(schema, table, rows) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  const exists = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );

  if (exists.rows.length === 0) {
    const columns = Object.keys(rows[0]);
    const colDefs = columns.map((col) => {
      const sampleValues = rows.slice(0, 50).map((r) => r[col]);
      const pgType = inferType(sampleValues);
      return `"${col}" ${pgType}`;
    });
    colDefs.unshift('_loaded_at TIMESTAMPTZ DEFAULT NOW()');
    const ddl = `CREATE TABLE "${schema}"."${table}" (${colDefs.join(', ')})`;
    await pool.query(ddl);
    console.log(`  [DB] Created ${schema}.${table} (${columns.length} columns)`);
    return true;
  }

  // Table exists — add any new columns
  const colResult = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );
  const existing = new Set(colResult.rows.map((r) => r.column_name));
  const newCols = Object.keys(rows[0]).filter((c) => !existing.has(c));
  for (const col of newCols) {
    const sampleValues = rows.slice(0, 50).map((r) => r[col]);
    const pgType = inferType(sampleValues);
    await pool.query(`ALTER TABLE "${schema}"."${table}" ADD COLUMN "${col}" ${pgType}`);
    console.log(`  [DB] Added column ${col} (${pgType}) to ${schema}.${table}`);
  }
  return false;
}

// Bulk insert rows
async function insertRows(schema, table, rows) {
  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((row, ri) => {
      const rowPh = columns.map((col, ci) => {
        const v = row[col];
        values.push(v == null ? null : typeof v === 'object' ? JSON.stringify(v) : v);
        return `$${ri * columns.length + ci + 1}`;
      });
      return `(${rowPh.join(', ')})`;
    });
    await pool.query(
      `INSERT INTO "${schema}"."${table}" (${colList}) VALUES ${placeholders.join(', ')}`,
      values
    );
    inserted += batch.length;
  }
  return inserted;
}

// Full load: truncate + insert
async function fullLoad(schema, table, rows) {
  if (!rows.length) return 0;
  await ensureTable(schema, table, rows);
  await pool.query(`TRUNCATE "${schema}"."${table}"`);
  return insertRows(schema, table, rows);
}

// Incremental load: upsert by key
async function incrementalLoad(schema, table, rows, keyColumn) {
  if (!rows.length) return 0;
  const created = await ensureTable(schema, table, rows);

  // Add unique constraint on key if table was just created
  if (created) {
    await pool.query(
      `ALTER TABLE "${schema}"."${table}" ADD CONSTRAINT "${table}_${keyColumn}_key" UNIQUE ("${keyColumn}")`
    );
  }

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const updateSet = columns
    .filter((c) => c !== keyColumn)
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  const batchSize = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((row, ri) => {
      const rowPh = columns.map((col, ci) => {
        const v = row[col];
        values.push(v == null ? null : typeof v === 'object' ? JSON.stringify(v) : v);
        return `$${ri * columns.length + ci + 1}`;
      });
      return `(${rowPh.join(', ')})`;
    });
    await pool.query(
      `INSERT INTO "${schema}"."${table}" (${colList}) VALUES ${placeholders.join(', ')}
       ON CONFLICT ("${keyColumn}") DO UPDATE SET ${updateSet}`,
      values
    );
    upserted += batch.length;
  }
  return upserted;
}

module.exports = {
  get pool() { return pool; },
  fullLoad,
  incrementalLoad,
  reconnect,
};
