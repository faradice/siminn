import { useState } from 'react';
import { useFetch, API } from './shared';
import { Clock, Calendar, ChevronDown, ChevronRight, KeyRound } from 'lucide-react';

const SCHEDULE_PRESETS = [
  { label: 'Á hverri klukkustund', value: '0 * * * *' },
  { label: 'Á 6 klst fresti', value: '0 */6 * * *' },
  { label: 'Daglega 06:00', value: '0 6 * * *' },
  { label: 'Vikulega mánud.', value: '0 6 * * 1' },
  { label: 'Slökkt', value: '' },
];

export default function SourcesPage({ onNavigate }) {
  const { data: sources, loading, refetch } = useFetch('/sources');
  const { data: savedSecrets } = useFetch('/secrets');
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [editSchedule, setEditSchedule] = useState(null);
  const [probeUrl, setProbeUrl] = useState('');
  const [probeHeaders, setProbeHeaders] = useState('');
  const [probeResult, setProbeResult] = useState(null);
  const [probing, setProbing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importTarget, setImportTarget] = useState({ schema: '', table: '' });
  const [showOAuth, setShowOAuth] = useState(false);
  const [oauth2, setOAuth2] = useState({ tokenUrl: '', clientId: '', clientSecret: '', username: '', password: '' });
  const setOA = (k, v) => setOAuth2(o => ({ ...o, [k]: v }));
  const hasOAuth = oauth2.tokenUrl.trim().length > 0;
  const [secretUrls, setSecretUrls] = useState([]);

  const loadSecret = async (name) => {
    const resp = await fetch(`${API}/secrets/${name}`);
    const { data } = await resp.json();
    if (data.oauth2) {
      setOAuth2(data.oauth2);
      setShowOAuth(true);
    }
    if (data.urls?.length) setProbeUrl(data.urls[0]);
    setSecretUrls(data.urls || []);
    setImportTarget(t => ({ ...t, schema: data.name || '' }));
    setProbeResult(null);
  };

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

  const setSchedule = async (name, schedule) => {
    await fetch(`${API}/sources/${name}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule }),
    });
    setEditSchedule(null);
    refetch();
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
        body: JSON.stringify({ url: probeUrl, headers, ...(hasOAuth && { oauth2 }) }),
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
          ...(hasOAuth && { oauth2 }),
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
                  <div className="flex items-center gap-2">
                    <button onClick={() => onNavigate('source-dashboard', s.name)} className="text-sm font-medium text-white hover:text-blue-400 transition-colors">{s.name}</button>
                    {s.schedule && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />{s.schedule}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{s.type}{s.lastRun ? ` — síðast keyrt ${new Date(s.lastRun).toLocaleString('is-IS')}` : ''}</div>
                </div>
                {/* Schedule control */}
                {editSchedule === s.name ? (
                  <div className="flex gap-1">
                    {SCHEDULE_PRESETS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => setSchedule(s.name, p.value)}
                        className={`text-[10px] px-2 py-1 rounded transition-colors ${s.schedule === p.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => setEditSchedule(s.name)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors"
                    title="Tímasetja"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                )}
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
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-lg font-semibold text-white">Ný uppspretta</h2>
          {savedSecrets?.length > 0 && (
            <div className="flex gap-1">
              {savedSecrets.map(s => (
                <button key={s.name} onClick={() => loadSecret(s.name)}
                  className="text-[10px] px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">
                  {s.name} {s.hasOAuth && <KeyRound className="w-2.5 h-2.5 inline ml-0.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">Sláðu inn REST API slóð til að skoða gögnin og flytja í gagnagrunn</p>
        <div className="space-y-3">
          {secretUrls.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {secretUrls.map(u => (
                <button key={u} onClick={() => { setProbeUrl(u); setProbeResult(null); setImportTarget(t => ({ ...t, table: u.split('/').pop()?.toLowerCase() || 'data' })); }}
                  className={`text-xs px-2 py-1 rounded transition-colors ${probeUrl === u ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  {u.split('/').pop()}
                </button>
              ))}
            </div>
          )}
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

          {/* OAuth2 */}
          <button onClick={() => setShowOAuth(!showOAuth)} className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors">
            {showOAuth ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <KeyRound className="w-3.5 h-3.5" />
            <span>OAuth2 {hasOAuth && <span className="text-emerald-400 ml-1">&#x2713;</span>}</span>
          </button>
          {showOAuth && (
            <div className="grid grid-cols-2 gap-2 p-3 bg-gray-900/40 rounded-lg border border-gray-700/30">
              <input value={oauth2.tokenUrl} onChange={e => setOA('tokenUrl', e.target.value)} placeholder="Token URL" className="col-span-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input value={oauth2.clientId} onChange={e => setOA('clientId', e.target.value)} placeholder="Client ID" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input value={oauth2.clientSecret} onChange={e => setOA('clientSecret', e.target.value)} placeholder="Client Secret" type="password" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input value={oauth2.username} onChange={e => setOA('username', e.target.value)} placeholder="Username" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input value={oauth2.password} onChange={e => setOA('password', e.target.value)} placeholder="Password" type="password" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          )}
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
