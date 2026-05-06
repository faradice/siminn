require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { pool, fullLoad } = require('./db');
const axios = require('axios');

const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../web/dist')));
}

// ── Source registry ──
const SOURCE_RUNNERS = {
  surveymonkey: () => require('./sources/surveymonkey'),
  salesforce: () => require('./sources/salesforce'),
};

// ── Ensure simipipe tables exist ──
async function ensureMetaTables() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS simipipe`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS simipipe.source (
      name TEXT PRIMARY KEY,
      source_type TEXT,
      url TEXT,
      config JSONB,
      schedule TEXT,
      last_run TIMESTAMPTZ,
      last_status TEXT,
      last_rows INTEGER
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS simipipe.run_history (
      id SERIAL PRIMARY KEY,
      source_name TEXT NOT NULL,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      status TEXT,
      rows INTEGER,
      error TEXT
    )
  `);
  // Add schedule column if missing (migration)
  await pool.query(`
    ALTER TABLE simipipe.source ADD COLUMN IF NOT EXISTS schedule TEXT
  `).catch(() => {});
}
ensureMetaTables().catch(err => console.error('[DB] Meta table init failed:', err.message));

// ── Run a source by name (shared logic) ──
async function runSourceByName(name) {
  const startedAt = new Date();
  try {
    let result;
    if (SOURCE_RUNNERS[name]) {
      const source = SOURCE_RUNNERS[name]();
      result = await source.run();
    } else {
      throw new Error(`Source "${name}" not found`);
    }

    const totalRows = typeof result === 'object'
      ? Object.values(result).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
      : 0;

    await pool.query(`
      INSERT INTO simipipe.source (name, source_type, last_run, last_status, last_rows)
      VALUES ($1, 'built-in', NOW(), 'success', $2)
      ON CONFLICT (name) DO UPDATE SET last_run = NOW(), last_status = 'success', last_rows = $2
    `, [name, totalRows]);

    await pool.query(`
      INSERT INTO simipipe.run_history (source_name, started_at, finished_at, status, rows)
      VALUES ($1, $2, NOW(), 'success', $3)
    `, [name, startedAt, totalRows]);

    return result;
  } catch (err) {
    await pool.query(`
      INSERT INTO simipipe.source (name, source_type, last_run, last_status, last_rows)
      VALUES ($1, 'built-in', NOW(), 'error', 0)
      ON CONFLICT (name) DO UPDATE SET last_run = NOW(), last_status = 'error'
    `, [name]);

    await pool.query(`
      INSERT INTO simipipe.run_history (source_name, started_at, finished_at, status, error)
      VALUES ($1, $2, NOW(), 'error', $3)
    `, [name, startedAt, err.message]);

    throw err;
  }
}

// ── Scheduler ──
const scheduledJobs = {};

async function initScheduler() {
  try {
    const res = await pool.query(`SELECT name, schedule FROM simipipe.source WHERE schedule IS NOT NULL`);
    for (const row of res.rows) {
      scheduleSource(row.name, row.schedule);
    }
  } catch { }
}

function scheduleSource(name, cronExpr) {
  if (scheduledJobs[name]) {
    scheduledJobs[name].stop();
    delete scheduledJobs[name];
  }
  if (!cronExpr || !cron.validate(cronExpr)) return;
  console.log(`[Scheduler] ${name} → ${cronExpr}`);
  scheduledJobs[name] = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] Running ${name}...`);
    try {
      await runSourceByName(name);
      console.log(`[Scheduler] ${name} completed`);
    } catch (err) {
      console.error(`[Scheduler] ${name} failed:`, err.message);
    }
  });
}

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
  try {
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'simipipe' AND table_name = 'source'`
    );
    let saved = [];
    if (exists.rows.length > 0) {
      const result = await pool.query(`SELECT * FROM simipipe.source ORDER BY name`);
      saved = result.rows;
    }
    const sources = Object.keys(SOURCE_RUNNERS).map((name) => {
      const s = saved.find((r) => r.name === name);
      return {
        name,
        type: 'built-in',
        schedule: s?.schedule || null,
        lastRun: s?.last_run || null,
        lastStatus: s?.last_status || null,
        lastRows: s?.last_rows || null,
      };
    });
    for (const s of saved.filter((r) => !SOURCE_RUNNERS[r.name])) {
      sources.push({
        name: s.name,
        type: s.source_type,
        url: s.url,
        schedule: s.schedule,
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
    const result = await runSourceByName(name);
    res.json({ data: result });
  } catch (err) {
    console.error(`[Run] ${name} failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Set source schedule ──
app.put('/api/sources/:name/schedule', async (req, res) => {
  const { name } = req.params;
  const { schedule } = req.body;
  if (schedule && !cron.validate(schedule)) {
    return res.status(400).json({ error: `Invalid cron: "${schedule}"` });
  }
  try {
    await pool.query(`
      INSERT INTO simipipe.source (name, source_type, schedule)
      VALUES ($1, 'built-in', $2)
      ON CONFLICT (name) DO UPDATE SET schedule = $2
    `, [name, schedule || null]);
    scheduleSource(name, schedule);
    res.json({ data: { name, schedule: schedule || null } });
  } catch (err) {
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

// ── API: Overview stats ──
app.get('/api/overview', async (req, res) => {
  try {
    const [tables, sources, diskResult, healthResult, historyResult] = await Promise.all([
      pool.query(`
        SELECT t.table_schema, t.table_name,
               COALESCE((SELECT reltuples::bigint FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = t.table_name AND n.nspname = t.table_schema), 0) as row_estimate
        FROM information_schema.tables t
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY t.table_schema, t.table_name
      `),
      pool.query(`SELECT * FROM simipipe.source ORDER BY name`).catch(() => ({ rows: [] })),
      pool.query(`SELECT pg_database_size(current_database()) as size`).catch(() => ({ rows: [{ size: null }] })),
      pool.query(`SELECT current_database(), current_user`).catch(() => ({ rows: [{}] })),
      pool.query(`
        SELECT source_name, status, rows, finished_at
        FROM simipipe.run_history
        ORDER BY finished_at DESC
        LIMIT 100
      `).catch(() => ({ rows: [] })),
    ]);

    const schemaMap = {};
    for (const r of tables.rows) {
      if (!schemaMap[r.table_schema]) schemaMap[r.table_schema] = [];
      schemaMap[r.table_schema].push({ table: r.table_name, rows: parseInt(r.row_estimate) || 0 });
    }
    const schemas = Object.entries(schemaMap).map(([name, tbls]) => ({
      name,
      tables: tbls.length,
      rows: tbls.reduce((s, t) => s + t.rows, 0),
      topTables: tbls.sort((a, b) => b.rows - a.rows).slice(0, 5),
    }));

    // Build per-source run history (last 10 runs each)
    const historyBySource = {};
    for (const h of historyResult.rows) {
      if (!historyBySource[h.source_name]) historyBySource[h.source_name] = [];
      if (historyBySource[h.source_name].length < 10) {
        historyBySource[h.source_name].push({ status: h.status, rows: h.rows || 0, at: h.finished_at });
      }
    }

    res.json({
      data: {
        schemaCount: schemas.length,
        tableCount: tables.rows.length,
        totalRows: schemas.reduce((s, sc) => s + sc.rows, 0),
        diskUsage: parseInt(diskResult.rows[0]?.size) || null,
        health: { ...healthResult.rows[0], status: 'ok' },
        sources: sources.rows.map(s => ({
          name: s.name, type: s.source_type, lastRun: s.last_run,
          lastStatus: s.last_status, lastRows: s.last_rows,
          schedule: s.schedule,
          history: (historyBySource[s.name] || []).reverse(),
        })),
        schemas,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Source dashboard ──
app.get('/api/sources/:name/dashboard', async (req, res) => {
  const { name } = req.params;
  try {
    // Source metadata
    const sourceRes = await pool.query(`SELECT * FROM simipipe.source WHERE name = $1`, [name]);
    const source = sourceRes.rows[0] || { name, source_type: 'built-in' };

    // Run history (last 30)
    const historyRes = await pool.query(`
      SELECT started_at, finished_at, status, rows, error
      FROM simipipe.run_history
      WHERE source_name = $1
      ORDER BY started_at DESC LIMIT 30
    `, [name]);

    // Tables in this source's schema
    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `, [name]);

    // Get exact row counts per table
    const tables = [];
    for (const t of tablesRes.rows) {
      const countRes = await pool.query(`SELECT COUNT(*) as cnt FROM "${name}"."${t.table_name}"`);
      tables.push({ table: t.table_name, rows: parseInt(countRes.rows[0].cnt) });
    }

    // Column analysis per table
    const tableDetails = {};
    for (const t of tables) {
      const colsRes = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [name, t.table]);

      const columns = [];
      for (const col of colsRes.rows) {
        const c = { name: col.column_name, type: col.data_type, chart: null };

        if (['integer', 'bigint', 'numeric', 'double precision', 'real', 'smallint'].includes(col.data_type)) {
          // Numeric: stats + histogram
          try {
            const statsRes = await pool.query(`
              SELECT MIN("${col.column_name}")::float as min_val,
                     MAX("${col.column_name}")::float as max_val,
                     AVG("${col.column_name}")::float as avg_val,
                     STDDEV("${col.column_name}")::float as stddev_val
              FROM "${name}"."${t.table}"
              WHERE "${col.column_name}" IS NOT NULL
            `);
            const stats = statsRes.rows[0];
            if (stats.min_val != null && stats.max_val != null && stats.min_val !== stats.max_val) {
              const histRes = await pool.query(`
                SELECT width_bucket("${col.column_name}"::float, $1::float, $2::float + 0.001, 10) as bucket,
                       COUNT(*) as cnt
                FROM "${name}"."${t.table}"
                WHERE "${col.column_name}" IS NOT NULL
                GROUP BY bucket ORDER BY bucket
              `, [stats.min_val, stats.max_val]);
              const step = (stats.max_val - stats.min_val) / 10;
              c.chart = {
                type: 'histogram',
                stats: { min: stats.min_val, max: stats.max_val, avg: stats.avg_val, stddev: stats.stddev_val },
                bins: histRes.rows.map(r => ({
                  label: `${(stats.min_val + (r.bucket - 1) * step).toFixed(1)}`,
                  count: parseInt(r.cnt),
                })),
              };
            }
          } catch { }
        } else if (['timestamp without time zone', 'timestamp with time zone', 'date'].includes(col.data_type)) {
          // Timestamp: range + weekly time series
          try {
            const tsRes = await pool.query(`
              SELECT MIN("${col.column_name}") as min_ts, MAX("${col.column_name}") as max_ts,
                     COUNT(*) as total
              FROM "${name}"."${t.table}"
              WHERE "${col.column_name}" IS NOT NULL
            `);
            if (tsRes.rows[0].total > 0) {
              const seriesRes = await pool.query(`
                SELECT date_trunc('week', "${col.column_name}") as week, COUNT(*) as cnt
                FROM "${name}"."${t.table}"
                WHERE "${col.column_name}" IS NOT NULL
                GROUP BY week ORDER BY week
              `);
              c.chart = {
                type: 'timeseries',
                range: { min: tsRes.rows[0].min_ts, max: tsRes.rows[0].max_ts },
                series: seriesRes.rows.map(r => ({ date: r.week, count: parseInt(r.cnt) })),
              };
            }
          } catch { }
        } else if (['character varying', 'text', 'character'].includes(col.data_type)) {
          // Text: check cardinality
          try {
            const cardRes = await pool.query(`
              SELECT COUNT(DISTINCT "${col.column_name}") as distinct_count
              FROM "${name}"."${t.table}"
              WHERE "${col.column_name}" IS NOT NULL
            `);
            const distinct = parseInt(cardRes.rows[0].distinct_count);
            if (distinct > 0 && distinct <= 20) {
              const valRes = await pool.query(`
                SELECT "${col.column_name}" as val, COUNT(*) as cnt
                FROM "${name}"."${t.table}"
                WHERE "${col.column_name}" IS NOT NULL
                GROUP BY val ORDER BY cnt DESC LIMIT 10
              `);
              c.chart = {
                type: 'categorical',
                distinctCount: distinct,
                values: valRes.rows.map(r => ({ value: String(r.val), count: parseInt(r.cnt) })),
              };
            }
          } catch { }
        }

        columns.push(c);
      }
      tableDetails[t.table] = columns;
    }

    res.json({
      data: {
        source: { name: source.name, type: source.source_type, schedule: source.schedule, lastRun: source.last_run, lastStatus: source.last_status, lastRows: source.last_rows },
        history: historyRes.rows.reverse(),
        tables,
        tableDetails,
      },
    });
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

// SPA fallback (production)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/dist/index.html'));
  });
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`[simipipe] http://localhost:${PORT}`);
  initScheduler();
});
