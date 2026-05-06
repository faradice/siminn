const axios = require('axios');

// Resolve ${ENV_VAR} placeholders in strings
function resolveEnv(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
}

function resolveEnvObj(obj) {
  if (!obj) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = resolveEnv(v);
  }
  return result;
}

// Navigate nested object by dot path: "data.items" → obj.data.items
function getByPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

// Flatten nested object: { a: { b: 1 } } → { "a.b": 1 }
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(result, flattenObject(v, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

// Apply column mapping: rename keys
function mapColumns(row, mapping) {
  if (!mapping) return row;
  const result = {};
  for (const [from, to] of Object.entries(mapping)) {
    if (from in row) result[to] = row[from];
  }
  // Keep unmapped columns too
  for (const [k, v] of Object.entries(row)) {
    if (!(k in mapping)) result[k] = v;
  }
  return result;
}

// Extract from REST API with optional pagination
async function extractRest(source) {
  const url = resolveEnv(source.url);
  const headers = resolveEnvObj(source.headers || {});
  const transform = source.transform || {};
  const pagination = source.pagination;

  let allRows = [];
  let page = 0;
  let nextUrl = url;

  while (nextUrl) {
    const params = {};
    if (pagination?.type === 'offset') {
      params.offset = page * (pagination.pageSize || 100);
      params.limit = pagination.pageSize || 100;
    }

    console.log(`[REST] Fetching ${nextUrl} (page ${page})`);
    const resp = await axios.get(nextUrl, { headers, params });
    const data = getByPath(resp.data, transform.root) || resp.data;

    if (!Array.isArray(data)) {
      // Single object response — wrap
      allRows.push(data);
      break;
    }

    let rows = data;
    if (transform.flatten) rows = rows.map((r) => flattenObject(r));
    if (transform.columns) rows = rows.map((r) => mapColumns(r, transform.columns));
    allRows.push(...rows);

    // Pagination
    if (!pagination || rows.length === 0) break;
    if (pagination.type === 'offset') {
      if (rows.length < (pagination.pageSize || 100)) break;
      page++;
      nextUrl = url;
    } else if (pagination.type === 'cursor') {
      const cursor = getByPath(resp.data, pagination.cursorPath);
      if (!cursor) break;
      nextUrl = `${url}${url.includes('?') ? '&' : '?'}${pagination.cursorParam || 'cursor'}=${cursor}`;
    } else if (pagination.type === 'link') {
      nextUrl = resp.data?.links?.next || null;
    } else {
      break;
    }
  }

  console.log(`[REST] Extracted ${allRows.length} rows from ${source.name}`);
  return allRows;
}

module.exports = { extractRest };
