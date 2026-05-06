import { useState } from 'react';
import { useFetch, API } from './shared';
import { Download, Search } from 'lucide-react';

const TYPE_COLORS = {
  'text': 'bg-blue-500/20 text-blue-400',
  'character varying': 'bg-blue-500/20 text-blue-400',
  'integer': 'bg-amber-500/20 text-amber-400',
  'bigint': 'bg-amber-500/20 text-amber-400',
  'numeric': 'bg-amber-500/20 text-amber-400',
  'boolean': 'bg-purple-500/20 text-purple-400',
  'timestamp with time zone': 'bg-emerald-500/20 text-emerald-400',
  'timestamp without time zone': 'bg-emerald-500/20 text-emerald-400',
  'date': 'bg-emerald-500/20 text-emerald-400',
  'jsonb': 'bg-pink-500/20 text-pink-400',
  'json': 'bg-pink-500/20 text-pink-400',
};

function typeLabel(dt) {
  if (dt.startsWith('character')) return 'text';
  if (dt.startsWith('timestamp')) return 'ts';
  return dt;
}

function exportCsv(columns, rows, filename) {
  const cols = columns.filter(c => c.column_name !== '_loaded_at');
  const header = cols.map(c => c.column_name).join(',');
  const body = rows.map(row =>
    cols.map(c => {
      const v = row[c.column_name];
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export default function DatabasePage({ initialSchema }) {
  const { data: schemas, loading } = useFetch('/tables');
  const [selected, setSelected] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [loadingTable, setLoadingTable] = useState(false);
  const [expandedSchema, setExpandedSchema] = useState(initialSchema || null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 200;

  const loadTable = async (schema, table, offset = 0) => {
    setSelected({ schema, table });
    setLoadingTable(true);
    setPage(offset / pageSize);
    const resp = await fetch(`${API}/tables/${schema}/${table}?limit=${pageSize}&offset=${offset}`);
    const data = await resp.json();
    setTableData(data.data);
    setLoadingTable(false);
  };

  if (initialSchema && !expandedSchema) {
    setExpandedSchema(initialSchema);
  }

  // Filter tables by search
  const filteredSchemas = schemas ? Object.entries(schemas).reduce((acc, [schema, tables]) => {
    if (!search) { acc[schema] = tables; return acc; }
    const q = search.toLowerCase();
    const matched = tables.filter(t => t.table.toLowerCase().includes(q) || schema.toLowerCase().includes(q));
    if (matched.length > 0) acc[schema] = matched;
    return acc;
  }, {}) : {};

  const totalPages = tableData ? Math.ceil(tableData.total / pageSize) : 0;

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Sidebar: schema/table tree */}
      <div className="w-64 flex-shrink-0 bg-gray-800/60 rounded-xl p-4 border border-gray-700/50 overflow-y-auto">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Leita..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {loading ? (
          <div className="text-xs text-gray-500">Hleð...</div>
        ) : Object.entries(filteredSchemas).map(([schema, tables]) => (
          <div key={schema} className="mb-3">
            <button
              onClick={() => setExpandedSchema(expandedSchema === schema ? null : schema)}
              className="w-full text-left text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 hover:text-gray-300 transition-colors"
            >
              {expandedSchema === schema ? '▾' : '▸'} {schema}
              <span className="text-gray-600 font-normal ml-1">({tables.length})</span>
            </button>
            {expandedSchema === schema && tables.map((t) => (
              <button
                key={t.table}
                onClick={() => { loadTable(schema, t.table); setPage(0); }}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${selected?.schema === schema && selected?.table === t.table
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
              >
                <span>{t.table}</span>
                <span className="text-[10px] text-gray-600 ml-1">({t.rows})</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Table data */}
      <div className="flex-1 bg-gray-800/60 rounded-xl border border-gray-700/50 overflow-hidden flex flex-col">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Veldu töflu til að skoða
          </div>
        ) : loadingTable ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Hleð...</div>
        ) : tableData ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white">{selected.schema}.{selected.table}</span>
                <span className="text-xs text-gray-500">{tableData.total.toLocaleString()} raðir</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Column type badges */}
                <div className="flex gap-1 flex-wrap">
                  {tableData.columns.filter(c => c.column_name !== '_loaded_at').map((c) => (
                    <span
                      key={c.column_name}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLORS[c.data_type] || 'bg-gray-700 text-gray-400'}`}
                      title={`${c.column_name}: ${c.data_type}`}
                    >
                      {c.column_name} <span className="opacity-60">{typeLabel(c.data_type)}</span>
                    </span>
                  ))}
                </div>
                {/* CSV export */}
                <button
                  onClick={() => exportCsv(tableData.columns, tableData.rows, `${selected.schema}_${selected.table}.csv`)}
                  className="p-1.5 rounded-lg bg-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  title="Sækja CSV"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    {tableData.columns.filter(c => c.column_name !== '_loaded_at').map((c) => (
                      <th key={c.column_name} className="text-left px-3 py-2 text-xs font-medium text-gray-500 sticky top-0 bg-gray-800/90">
                        {c.column_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-700/20">
                      {tableData.columns.filter(c => c.column_name !== '_loaded_at').map((c) => (
                        <td key={c.column_name} className="px-3 py-1.5 text-xs text-gray-300 max-w-xs truncate" title={String(row[c.column_name] ?? '')}>
                          {row[c.column_name] == null ? <span className="text-gray-600">null</span> : String(row[c.column_name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700/50 text-xs">
                <span className="text-gray-500">
                  Sýni {page * pageSize + 1}–{Math.min((page + 1) * pageSize, tableData.total)} af {tableData.total.toLocaleString()}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => loadTable(selected.schema, selected.table, (page - 1) * pageSize)}
                    disabled={page === 0}
                    className="px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← Fyrri
                  </button>
                  <span className="px-2 py-1 text-gray-400">{page + 1} / {totalPages}</span>
                  <button
                    onClick={() => loadTable(selected.schema, selected.table, (page + 1) * pageSize)}
                    disabled={page >= totalPages - 1}
                    className="px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Næsta →
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
