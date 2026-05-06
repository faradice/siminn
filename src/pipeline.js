const fs = require('fs');
const yaml = require('yaml');
const path = require('path');
const { fullLoad, incrementalLoad, pool } = require('./db');
const { extractRest } = require('./extract-rest');
const { extractPostgres } = require('./extract-db');

function loadSources(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  const config = yaml.parse(raw);
  return config.sources || [];
}

async function runSource(source) {
  const start = Date.now();
  console.log(`\n━━━ ${source.name} (${source.type}) ━━━`);

  // Extract
  let rows;
  if (source.type === 'rest_api') {
    rows = await extractRest(source);
  } else if (source.type === 'postgres') {
    rows = await extractPostgres(source);
  } else {
    throw new Error(`Unknown source type: ${source.type}`);
  }

  if (!rows.length) {
    console.log(`[Pipeline] No data extracted for ${source.name}`);
    return { source: source.name, rows: 0, ms: Date.now() - start };
  }

  // Load
  const { schema, table, mode, key } = source.target;
  let loaded;
  if (mode === 'incremental' && key) {
    loaded = await incrementalLoad(schema, table, rows, key);
  } else {
    loaded = await fullLoad(schema, table, rows);
  }

  const ms = Date.now() - start;
  console.log(`[Pipeline] ${source.name}: ${loaded} rows → ${schema}.${table} (${ms}ms)`);
  return { source: source.name, rows: loaded, ms };
}

async function runAll(configFile) {
  const sources = loadSources(configFile || path.join(__dirname, '..', 'sources.yaml'));
  if (!sources.length) {
    console.log('No sources defined in sources.yaml');
    return [];
  }

  const results = [];
  for (const source of sources) {
    try {
      const result = await runSource(source);
      results.push(result);
    } catch (err) {
      console.error(`[Pipeline] FAILED ${source.name}:`, err.message);
      results.push({ source: source.name, error: err.message });
    }
  }

  console.log('\n━━━ Summary ━━━');
  for (const r of results) {
    if (r.error) {
      console.log(`  ✗ ${r.source}: ${r.error}`);
    } else {
      console.log(`  ✓ ${r.source}: ${r.rows} rows (${r.ms}ms)`);
    }
  }

  return results;
}

// Run a single source by name
async function runOne(name, configFile) {
  const sources = loadSources(configFile || path.join(__dirname, '..', 'sources.yaml'));
  const source = sources.find((s) => s.name === name);
  if (!source) throw new Error(`Source "${name}" not found in config`);
  return runSource(source);
}

module.exports = { runAll, runOne, runSource };
