import { useState, useEffect, useCallback } from 'react';

const API = '/api';

function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const refetch = useCallback(() => {
    setLoading(true);
    fetch(API + url).then(r => r.json()).then(r => { setData(r.data); setLoading(false); });
  }, [url]);
  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, refetch };
}

// ── Sources Page ──

function SourcesPage() {
  const { data: sources, loading, refetch } = useFetch('/sources');
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [probeUrl, setProbeUrl] = useState('');
  const [probeHeaders, setProbeHeaders] = useState('');
  const [probeResult, setProbeResult] = useState(null);
  const [probing, setProbing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importTarget, setImportTarget] = useState({ schema: '', table: '' });

  const runSource = async (name) => {
    setRunning(name);
    setResult(null);
    try {
      const resp = await fetch(`${API}/sources/${name}/run`, { method: 'POST' });
      const data = await resp.json();
      setResult(data.data || data);
      refetch();
    } catch (err) {
      setResult({ error: err.message });
    }
    setRunning(null);
  };

  const probeApi = async () => {
    setProbing(true);
    setProbeResult(null);
    try {
      let headers = {};
      if (probeHeaders.trim()) {
        try { headers = JSON.parse(probeHeaders); } catch { }
      }
      const resp = await fetch(`${API}/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: probeUrl, headers }),
      });
      const data = await resp.json();
      setProbeResult(data.data || data);
      setImportTarget({ schema: 'imported', table: probeUrl.split('/').pop()?.replace(/[^a-z0-9]/gi, '_') || 'data' });
    } catch (err) {
      setProbeResult({ error: err.message });
    }
    setProbing(false);
  };

  const importData = async () => {
    setImporting(true);
    try {
      let headers = {};
      if (probeHeaders.trim()) {
        try { headers = JSON.parse(probeHeaders); } catch { }
      }
      const resp = await fetch(`${API}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: probeUrl, headers,
          schema: importTarget.schema,
          table: importTarget.table,
          dataPath: probeResult?.dataPath || null,
        }),
      });
      const data = await resp.json();
      setResult(data.data || data);
    } catch (err) {
      setResult({ error: err.message });
    }
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      {/* Built-in sources */}
      <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700/50">
        <h2 className="text-lg font-semibold text-white mb-1">Uppsprettur</h2>
        <p className="text-sm text-gray-500 mb-4">Skráðar gagnalindir — smelltu á „Keyra" til að sækja gögn</p>
        {loading ? (
          <div className="text-gray-500 text-sm">Hleð...</div>
        ) : (
          <div className="space-y-2">
            {sources?.map((s) => (
              <div key={s.name} className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700/30">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.type}{s.lastRun ? ` — síðast keyrt ${new Date(s.lastRun).toLocaleString('is-IS')}` : ''}</div>
                </div>
                {s.lastRows != null && (
                  <span className="text-xs text-gray-500">{s.lastRows} raðir</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded ${s.lastStatus === 'success' ? 'bg-green-500/20 text-green-400' : s.lastStatus ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400'}`}>
                  {s.lastStatus || 'ekki keyrt'}
                </span>
                <button
                  onClick={() => runSource(s.name)}
                  disabled={running === s.name}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${running === s.name
                    ? 'bg-gray-700 text-gray-400 cursor-wait'
                    : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30'
                    }`}
                >
                  {running === s.name ? 'Keyrir...' : 'Keyra'}
                </button>
              </div>
            ))}
          </div>
        )}
        {result && (
          <div className="mt-4 p-4 rounded-lg bg-gray-900/60 border border-gray-700/30">
            <div className="text-xs font-medium text-gray-400 mb-2">Niðurstaða</div>
            {result.error ? (
              <div className="text-sm text-red-400">{result.error}</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {Object.entries(result).map(([k, v]) => (
                  <div key={k} className="bg-gray-800/60 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-white">{typeof v === 'number' ? v.toLocaleString() : v}</div>
                    <div className="text-[10px] text-gray-500">{k}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Probe + Import */}
      <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700/50">
        <h2 className="text-lg font-semibold text-white mb-1">Ný uppspretta</h2>
        <p className="text-sm text-gray-500 mb-4">Sláðu inn REST API slóð til að skoða gögnin og flytja í gagnagrunn</p>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={probeUrl}
              onChange={(e) => setProbeUrl(e.target.value)}
              placeholder="https://api.example.com/data"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={probeApi}
              disabled={probing || !probeUrl}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600/20 border border-blue-500/40 text-blue-400 hover:bg-blue-600/30 transition-colors disabled:opacity-40"
            >
              {probing ? 'Skoða...' : 'Skoða API'}
            </button>
          </div>
          <input
            type="text"
            value={probeHeaders}
            onChange={(e) => setProbeHeaders(e.target.value)}
            placeholder='Hausar (valkvætt): {"Authorization": "Bearer ..."}'
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {probeResult && !probeResult.error && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400">{probeResult.status}</span>
              <span className="text-gray-400">{probeResult.contentType}</span>
              {probeResult.rowCount != null && <span className="text-gray-400">{probeResult.rowCount} raðir</span>}
              {probeResult.dataPath && <span className="text-xs text-gray-500">root: {probeResult.dataPath}</span>}
            </div>

            {probeResult.sampleKeys && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Dálkar ({probeResult.sampleKeys.length})</div>
                <div className="flex flex-wrap gap-1">
                  {probeResult.sampleKeys.map((k) => (
                    <span key={k} className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{k}</span>
                  ))}
                </div>
              </div>
            )}

            {probeResult.sample && (
              <div className="overflow-x-auto">
                <div className="text-xs text-gray-500 mb-1">Sýnishorn</div>
                <pre className="text-xs text-gray-400 bg-gray-900/60 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {JSON.stringify(Array.isArray(probeResult.sample) ? probeResult.sample : probeResult.sample, null, 2)}
                </pre>
              </div>
            )}

            {/* Import controls */}
            <div className="flex items-end gap-2 pt-2 border-t border-gray-700/50">
              <div>
                <label className="text-xs text-gray-500">Schema</label>
                <input
                  type="text" value={importTarget.schema}
                  onChange={(e) => setImportTarget(t => ({ ...t, schema: e.target.value }))}
                  className="block w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Tafla</label>
                <input
                  type="text" value={importTarget.table}
                  onChange={(e) => setImportTarget(t => ({ ...t, table: e.target.value }))}
                  className="block w-48 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={importData}
                disabled={importing || !importTarget.schema || !importTarget.table}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-40"
              >
                {importing ? 'Flyt inn...' : 'Flytja inn'}
              </button>
            </div>
          </div>
        )}
        {probeResult?.error && (
          <div className="mt-3 text-sm text-red-400">{probeResult.error}</div>
        )}
      </div>
    </div>
  );
}

// ── Database Page ──

function DatabasePage() {
  const { data: schemas, loading, refetch } = useFetch('/tables');
  const [selected, setSelected] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [loadingTable, setLoadingTable] = useState(false);

  const loadTable = async (schema, table) => {
    setSelected({ schema, table });
    setLoadingTable(true);
    const resp = await fetch(`${API}/tables/${schema}/${table}?limit=200`);
    const data = await resp.json();
    setTableData(data.data);
    setLoadingTable(false);
  };

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Sidebar: schema/table tree */}
      <div className="w-64 flex-shrink-0 bg-gray-800/60 rounded-xl p-4 border border-gray-700/50 overflow-y-auto">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Töflur</h3>
        {loading ? (
          <div className="text-xs text-gray-500">Hleð...</div>
        ) : schemas && Object.entries(schemas).map(([schema, tables]) => (
          <div key={schema} className="mb-3">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{schema}</div>
            {tables.map((t) => (
              <button
                key={t.table}
                onClick={() => loadTable(schema, t.table)}
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
      <div className="flex-1 bg-gray-800/60 rounded-xl border border-gray-700/50 overflow-hidden">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Veldu töflu til að skoða
          </div>
        ) : loadingTable ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Hleð...</div>
        ) : tableData ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
              <div>
                <span className="text-sm font-medium text-white">{selected.schema}.{selected.table}</span>
                <span className="text-xs text-gray-500 ml-2">{tableData.total.toLocaleString()} raðir</span>
              </div>
              <div className="flex gap-1">
                {tableData.columns.map((c) => (
                  <span key={c.column_name} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400" title={c.data_type}>
                    {c.column_name}
                  </span>
                ))}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── App Shell ──

export default function App() {
  const [page, setPage] = useState('sources');

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm">S</div>
            <h1 className="text-lg font-bold text-white">simipipe</h1>
            <span className="text-xs text-gray-600">source → database</span>
          </div>
          <nav className="flex gap-1 bg-gray-800/60 p-1 rounded-lg">
            {[
              { key: 'sources', label: 'Uppsprettur' },
              { key: 'database', label: 'Gagnagrunnur' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setPage(tab.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${page === tab.key
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {page === 'sources' && <SourcesPage />}
        {page === 'database' && <DatabasePage />}
      </main>
    </div>
  );
}
