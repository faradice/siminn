require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, fullLoad } = require('./db');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ── Source registry ──
const SOURCE_RUNNERS = {
  surveymonkey: () => require('./sources/surveymonkey'),
};

// ── API: List schemas and tables ──
app.get('/api/tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_schema, table_name,
             (SELECT reltuples::bigint FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relname = t.table_name AND n.nspname = t.table_schema) as row_estimate
      FROM information_schema.tables t
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    const schemas = {};
    for (const row of result.rows) {
      if (!schemas[row.table_schema]) schemas[row.table_schema] = [];
      schemas[row.table_schema].push({ table: row.table_name, rows: parseInt(row.row_estimate) || 0 });
    }
    res.json({ data: schemas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Get table data ──
app.get('/api/tables/:schema/:table', async (req, res) => {
  const { schema, table } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const [data, count, columns] = await Promise.all([
      pool.query(`SELECT * FROM "${schema}"."${table}" LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query(`SELECT COUNT(*) as total FROM "${schema}"."${table}"`),
      pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, table]),
    ]);
    res.json({
      data: {
        rows: data.rows,
        total: parseInt(count.rows[0].total),
        columns: columns.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: List configured sources ──
app.get('/api/sources', async (req, res) => {
  // For now, return registered source runners + any saved configs
  try {
    // Check if config table exists
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'simipipe' AND table_name = 'source'`
    );
    let saved = [];
    if (exists.rows.length > 0) {
      const result = await pool.query(`SELECT * FROM simipipe.source ORDER BY name`);
      saved = result.rows;
    }
    // Merge with built-in sources
    const sources = Object.keys(SOURCE_RUNNERS).map((name) => {
      const s = saved.find((r) => r.name === name);
      return {
        name,
        type: 'built-in',
        lastRun: s?.last_run || null,
        lastStatus: s?.last_status || null,
        lastRows: s?.last_rows || null,
      };
    });
    // Add any custom REST sources
    for (const s of saved.filter((r) => !SOURCE_RUNNERS[r.name])) {
      sources.push({
        name: s.name,
        type: s.source_type,
        url: s.url,
        lastRun: s.last_run,
        lastStatus: s.last_status,
        lastRows: s.last_rows,
      });
    }
    res.json({ data: sources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Run a source ──
app.post('/api/sources/:name/run', async (req, res) => {
  const { name } = req.params;
  try {
    let result;
    if (SOURCE_RUNNERS[name]) {
      const source = SOURCE_RUNNERS[name]();
      result = await source.run();
    } else {
      // Check saved custom sources
      const saved = await pool.query(
        `SELECT * FROM simipipe.source WHERE name = $1`, [name]
      );
      if (!saved.rows.length) return res.status(404).json({ error: `Source "${name}" not found` });
      const config = saved.rows[0];
      result = await runCustomSource(config);
    }

    // Save run status
    await pool.query(`CREATE SCHEMA IF NOT EXISTS simipipe`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS simipipe.source (
        name TEXT PRIMARY KEY,
        source_type TEXT,
        url TEXT,
        config JSONB,
        last_run TIMESTAMPTZ,
        last_status TEXT,
        last_rows INTEGER
      )
    `);
    const totalRows = typeof result === 'object'
      ? Object.values(result).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
      : 0;
    await pool.query(`
      INSERT INTO simipipe.source (name, source_type, last_run, last_status, last_rows)
      VALUES ($1, 'built-in', NOW(), 'success', $2)
      ON CONFLICT (name) DO UPDATE SET last_run = NOW(), last_status = 'success', last_rows = $2
    `, [name, totalRows]);

    res.json({ data: result });
  } catch (err) {
    console.error(`[Run] ${name} failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Probe a REST API ──
app.post('/api/probe', async (req, res) => {
  const { url, headers } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const resp = await axios.get(url, {
      headers: headers || {},
      timeout: 10000,
    });
    const data = resp.data;
    const info = {
      status: resp.status,
      contentType: resp.headers['content-type'],
      isArray: Array.isArray(data),
      isObject: typeof data === 'object' && !Array.isArray(data),
      sampleKeys: null,
      rowCount: null,
      sample: null,
    };
    if (Array.isArray(data)) {
      info.rowCount = data.length;
      info.sampleKeys = data.length > 0 ? Object.keys(data[0]) : [];
      info.sample = data.slice(0, 3);
    } else if (typeof data === 'object') {
      info.sampleKeys = Object.keys(data);
      // Check for common paginated API patterns
      for (const key of ['data', 'results', 'items', 'records', 'rows']) {
        if (Array.isArray(data[key])) {
          info.dataPath = key;
          info.rowCount = data[key].length;
          info.sampleKeys = data[key].length > 0 ? Object.keys(data[key][0]) : [];
          info.sample = data[key].slice(0, 3);
          break;
        }
      }
      if (!info.sample) info.sample = data;
    }
    res.json({ data: info });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: Import from probed API ──
app.post('/api/import', async (req, res) => {
  const { url, headers, schema, table, dataPath } = req.body;
  if (!url || !schema || !table) {
    return res.status(400).json({ error: 'url, schema, and table required' });
  }
  try {
    const resp = await axios.get(url, { headers: headers || {}, timeout: 30000 });
    let rows = resp.data;
    if (dataPath) {
      rows = dataPath.split('.').reduce((o, k) => o?.[k], rows);
    }
    if (!Array.isArray(rows)) {
      rows = [rows];
    }
    // Flatten nested objects
    rows = rows.map((row) => {
      const flat = {};
      for (const [k, v] of Object.entries(row)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          for (const [k2, v2] of Object.entries(v)) {
            flat[`${k}_${k2}`] = v2;
          }
        } else {
          flat[k] = v;
        }
      }
      return flat;
    });

    const count = await fullLoad(schema, table, rows);
    res.json({ data: { rows: count, schema, table } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: DB connection test ──
app.get('/api/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT current_database(), current_user');
    res.json({ data: { ...r.rows[0], status: 'ok' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`[simipipe] http://localhost:${PORT}`));
