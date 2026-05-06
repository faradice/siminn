const { Pool } = require('pg');

// Resolve ${ENV_VAR} placeholders
function resolveEnv(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
}

// Extract from a remote PostgreSQL database
async function extractPostgres(source) {
  const conn = source.connection;
  const remotePool = new Pool({
    host: resolveEnv(conn.host),
    port: parseInt(resolveEnv(conn.port) || '5432'),
    database: resolveEnv(conn.database),
    user: resolveEnv(conn.user),
    password: resolveEnv(conn.password),
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    max: 2,
  });

  try {
    const query = resolveEnv(source.query);
    const params = (source.params || []).map(resolveEnv);
    console.log(`[DB-Extract] Running query on ${conn.host}/${conn.database}`);
    const result = await remotePool.query(query, params);
    console.log(`[DB-Extract] Got ${result.rows.length} rows from ${source.name}`);
    return result.rows;
  } finally {
    await remotePool.end();
  }
}

module.exports = { extractPostgres };
