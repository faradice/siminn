#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('./db');

// Source registry — add new sources here
const SOURCES = {
  surveymonkey: () => require('./sources/surveymonkey'),
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    if (command === 'run' && args[1]) {
      const name = args[1];
      if (!SOURCES[name]) {
        console.error(`Unknown source: ${name}\nAvailable: ${Object.keys(SOURCES).join(', ')}`);
        process.exit(1);
      }
      const source = SOURCES[name]();
      await source.run();
    } else if (command === 'test-db') {
      const result = await pool.query('SELECT current_database(), current_user, version()');
      console.log('Connected:', result.rows[0]);
    } else if (command === 'list') {
      console.log('Available sources:', Object.keys(SOURCES).join(', '));
    } else {
      console.log(`
simipipe — Source → PostgreSQL pipeline

Usage:
  node src/cli.js test-db              Test local PostgreSQL connection
  node src/cli.js list                 List available sources
  node src/cli.js run <source>         Run a source (e.g. surveymonkey)
      `);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
