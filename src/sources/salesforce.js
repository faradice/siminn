const jsforce = require('jsforce');
const { fullLoad } = require('../db');

const SCHEMA = 'salesforce';

// Default objects to pull — override with SF_OBJECTS env var (comma-separated)
const DEFAULT_OBJECTS = ['Account', 'Contact', 'Opportunity', 'Lead', 'Case'];

function getConfig() {
  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  const username = process.env.SF_USERNAME;
  const password = process.env.SF_PASSWORD;
  const securityToken = process.env.SF_SECURITY_TOKEN || '';

  if (!username || !password) {
    throw new Error('SF_USERNAME and SF_PASSWORD required');
  }
  return { loginUrl, clientId, clientSecret, username, password, securityToken };
}

async function connect() {
  const cfg = getConfig();
  const conn = new jsforce.Connection({
    loginUrl: cfg.loginUrl,
    ...(cfg.clientId && { oauth2: { clientId: cfg.clientId, clientSecret: cfg.clientSecret } }),
  });
  await conn.login(cfg.username, cfg.password + cfg.securityToken);
  console.log(`  [SF] Logged in as ${cfg.username}`);
  return conn;
}

// Describe object → get all queryable fields
async function getFields(conn, objectName) {
  const desc = await conn.describe(objectName);
  return desc.fields
    .filter(f => !f.deprecatedAndHidden)
    .map(f => f.name);
}

// Query all records for an object
async function queryAll(conn, objectName, fields) {
  const soql = `SELECT ${fields.join(', ')} FROM ${objectName}`;
  console.log(`  Querying ${objectName}...`);
  const records = [];
  const result = await conn.query(soql);
  records.push(...result.records);

  let next = result;
  while (!next.done) {
    next = await conn.queryMore(next.nextRecordsUrl);
    records.push(...next.records);
    if (records.length % 2000 === 0) {
      console.log(`    ${records.length} records so far...`);
    }
  }

  // Strip jsforce metadata
  return records.map(r => {
    const row = {};
    for (const f of fields) {
      const v = r[f];
      row[f.toLowerCase()] = v && typeof v === 'object' && v.attributes ? null : v ?? null;
    }
    return row;
  });
}

async function run() {
  console.log('\n━━━ Salesforce Extract ━━━');
  const conn = await connect();

  const objects = (process.env.SF_OBJECTS || DEFAULT_OBJECTS.join(',')).split(',').map(s => s.trim()).filter(Boolean);
  const summary = {};

  for (const obj of objects) {
    try {
      const fields = await getFields(conn, obj);
      const rows = await queryAll(conn, obj, fields);
      const tableName = obj.toLowerCase();
      if (rows.length > 0) {
        summary[tableName] = await fullLoad(SCHEMA, tableName, rows);
      } else {
        summary[tableName] = 0;
      }
      console.log(`  ${SCHEMA}.${tableName}: ${summary[tableName]} rows (${fields.length} fields)`);
    } catch (err) {
      console.error(`  [SF] ${obj} failed: ${err.message}`);
      summary[obj.toLowerCase()] = `error: ${err.message}`;
    }
  }

  console.log('\n  ── Summary ──');
  for (const [table, count] of Object.entries(summary)) {
    console.log(`  ${SCHEMA}.${table}: ${count}`);
  }

  await conn.logout();
  return summary;
}

module.exports = { run };
