import { useState } from 'react';
import { useFetch, API } from './shared';
import { Clock, Calendar, ChevronDown, ChevronUp, Search, Pencil, Plus, KeyRound } from 'lucide-react';

const SCHEDULE_PRESETS = [
  { label: 'Á hverri klukkustund', value: '0 * * * *' },
  { label: 'Á 6 klst fresti', value: '0 */6 * * *' },
  { label: 'Daglega 06:00', value: '0 6 * * *' },
  { label: 'Vikulega mánud.', value: '0 6 * * 1' },
  { label: 'Slökkt', value: '' },
];

export default function SourcesPage({ onNavigate }) {
  const { data: sources, loading, refetch } = useFetch('/sources');
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [editSchedule, setEditSchedule] = useState(null);
  const [expanded, setExpanded] = useState(null); // source name with open probe panel
  const [probeState, setProbeState] = useState({ url: '', urls: [], result: null, probing: false, importing: false, schema: '', table: '' });

  const runSource = async (name) => {
    setRunning(name);
    setResult(null);
    try {
      const resp = await fetch(`${API}/sources/${name}/run`, { method: 'POST' });
      const data = await resp.json();
      setResult({ name, data: data.data || data });
      refetch();
    } catch (err) {
      setResult({ name, data: { error: err.message } });
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

  const toggleProbe = async (name) => {
    if (expanded === name) { setExpanded(null); return; }
    setExpanded(name);
    setProbeState({ url: '', urls: [], result: null, probing: false, importing: false, schema: name, table: '' });
    try {
      const r = await fetch(`${API}/secrets/${name}`);
      if (r.ok) {
        const { data } = await r.json();
        const urls = data.urls || [];
        setProbeState(s => ({ ...s, urls, url: urls[0] || '', table: urls[0]?.split('/').pop()?.toLowerCase() || 'data' }));
      }
    } catch {}
  };

  const probe = async () => {
    const src = sources?.find(s => s.name === expanded);
    setProbeState(s => ({ ...s, probing: true, result: null }));
    try {
      // Load secret for OAuth2
      let oauth2 = null;
      try {
        const sr = await fetch(`${API}/secrets/${expanded}`);
        if (sr.ok) { const { data } = await sr.json(); oauth2 = data.oauth2; }
      } catch {}
      const resp = await fetch(`${API}/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: probeState.url, ...(oauth2?.tokenUrl && { oauth2 }) }),
      });
      const data = await resp.json();
      setProbeState(s => ({ ...s, result: data.data || data, probing: false }));
    } catch (err) {
      setProbeState(s => ({ ...s, result: { error: err.message }, probing: false }));
    }
  };

  const importData = async () => {
    setProbeState(s => ({ ...s, importing: true }));
    try {
      let oauth2 = null;
      try {
        const sr = await fetch(`${API}/secrets/${expanded}`);
        if (sr.ok) { const { data } = await sr.json(); oauth2 = data.oauth2; }
      } catch {}
      const resp = await fetch(`${API}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: probeState.url, ...(oauth2?.tokenUrl && { oauth2 }),
          schema: probeState.schema, table: probeState.table,
          dataPath: probeState.result?.dataPath || null,
        }),
      });
      const data = await resp.json();
      setResult({ name: expanded, data: data.data || data });
      refetch();
    } catch (err) {
      setResult({ name: expanded, data: { error: err.message } });
    }
    setProbeState(s => ({ ...s, importing: false }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Uppsprettur</h2>
            <p className="text-sm text-gray-500">Allar gagnalindir — smelltu á „Keyra" til að sækja gögn</p>
          </div>
          <button onClick={() => onNavigate('settings')}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Bæta við
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Hleð...</div>
        ) : (
          <div className="space-y-2">
            {sources?.map((s) => (
              <div key={s.name}>
                {/* Source card */}
                <div className={`flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700/30 ${expanded === s.name ? 'rounded-b-none border-b-0' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onNavigate('source-dashboard', s.name)} className="text-sm font-medium text-white hover:text-blue-400 transition-colors">{s.name}</button>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.type === 'built-in' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'}`}>
                        {s.type === 'built-in' ? 'built-in' : 'REST'}
                      </span>
                      {s.hasOAuth && <KeyRound className="w-3 h-3 text-amber-500/60" />}
                      {s.schedule && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />{s.schedule}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {s.lastRun ? `síðast keyrt ${new Date(s.lastRun).toLocaleString('is-IS')}` : 'ekki keyrt'}
                    </div>
                  </div>

                  {/* Schedule */}
                  {editSchedule === s.name ? (
                    <div className="flex gap-1">
                      {SCHEDULE_PRESETS.map(p => (
                        <button key={p.value} onClick={() => setSchedule(s.name, p.value)}
                          className={`text-[10px] px-2 py-1 rounded transition-colors ${s.schedule === p.value ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEditSchedule(s.name)} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors" title="Tímasetja">
                      <Clock className="w-4 h-4" />
                    </button>
                  )}

                  {s.lastRows != null && <span className="text-xs text-gray-500">{s.lastRows.toLocaleString()} raðir</span>}

                  <span className={`text-xs px-2 py-0.5 rounded ${s.lastStatus === 'success' ? 'bg-green-500/20 text-green-400' : s.lastStatus ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400'}`}>
                    {s.lastStatus || '—'}
                  </span>

                  {/* Actions */}
                  {(s.type !== 'built-in' || s.urls?.length > 0) && (
                    <button onClick={() => toggleProbe(s.name)} title="Skoða API"
                      className={`p-1.5 rounded-lg transition-colors ${expanded === s.name ? 'bg-blue-600/20 text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'}`}>
                      {expanded === s.name ? <ChevronUp className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                    </button>
                  )}

                  <button onClick={() => runSource(s.name)} disabled={running === s.name}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${running === s.name
                      ? 'bg-gray-700 text-gray-400 cursor-wait'
                      : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30'}`}>
                    {running === s.name ? 'Keyrir...' : 'Keyra'}
                  </button>

                  <button onClick={() => onNavigate('settings')} title="Breyta" className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>

                {/* Inline probe panel */}
                {expanded === s.name && (
                  <div className="p-4 bg-gray-900/30 border border-gray-700/30 border-t-0 rounded-b-lg space-y-3">
                    {/* URL selector */}
                    {probeState.urls.length > 1 && (
                      <div className="flex gap-1 flex-wrap">
                        {probeState.urls.map(u => (
                          <button key={u} onClick={() => setProbeState(ps => ({ ...ps, url: u, result: null, table: u.split('/').pop()?.toLowerCase() || 'data' }))}
                            className={`text-xs px-2 py-1 rounded transition-colors ${probeState.url === u ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                            {u.split('/').pop()}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input type="text" value={probeState.url} onChange={e => setProbeState(ps => ({ ...ps, url: e.target.value }))}
                        placeholder="https://api.example.com/data"
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={probe} disabled={probeState.probing || !probeState.url}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600/20 border border-blue-500/40 text-blue-400 hover:bg-blue-600/30 transition-colors disabled:opacity-40">
                        {probeState.probing ? 'Skoða...' : 'Skoða API'}
                      </button>
                    </div>

                    {/* Probe result */}
                    {probeState.result && !probeState.result.error && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400">{probeState.result.status}</span>
                          {probeState.result.rowCount != null && <span className="text-gray-400">{probeState.result.rowCount.toLocaleString()} raðir</span>}
                        </div>
                        {probeState.result.sampleKeys && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Dálkar ({probeState.result.sampleKeys.length})</div>
                            <div className="flex flex-wrap gap-1">
                              {probeState.result.sampleKeys.map(k => (
                                <span key={k} className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{k}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {probeState.result.sample && (
                          <pre className="text-xs text-gray-400 bg-gray-900/60 rounded-lg p-3 max-h-48 overflow-auto">
                            {JSON.stringify(probeState.result.sample, null, 2)}
                          </pre>
                        )}
                        <div className="flex items-end gap-2 pt-2 border-t border-gray-700/50">
                          <div>
                            <label className="text-xs text-gray-500">Schema</label>
                            <input type="text" value={probeState.schema} onChange={e => setProbeState(ps => ({ ...ps, schema: e.target.value }))}
                              className="block w-32 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Tafla</label>
                            <input type="text" value={probeState.table} onChange={e => setProbeState(ps => ({ ...ps, table: e.target.value }))}
                              className="block w-48 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <button onClick={importData} disabled={probeState.importing || !probeState.schema || !probeState.table}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-40">
                            {probeState.importing ? 'Flyt inn...' : 'Flytja inn'}
                          </button>
                        </div>
                      </div>
                    )}
                    {probeState.result?.error && (
                      <div className="text-sm text-red-400">{probeState.result.error}</div>
                    )}
                  </div>
                )}

                {/* Run result for this source */}
                {result?.name === s.name && (
                  <div className="mt-1 p-4 rounded-lg bg-gray-900/60 border border-gray-700/30">
                    <div className="text-xs font-medium text-gray-400 mb-2">Niðurstaða</div>
                    {result.data.error ? (
                      <div className="text-sm text-red-400">{result.data.error}</div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {Object.entries(result.data).map(([k, v]) => (
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
