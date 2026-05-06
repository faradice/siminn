import { useState } from 'react';
import { useFetch, API } from './shared';
import { Database, Layers, Rows3, Play, CheckCircle, XCircle, Clock, HardDrive, Activity } from 'lucide-react';

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'rétt í þessu';
  if (s < 3600) return `${Math.floor(s / 60)} mín síðan`;
  if (s < 86400) return `${Math.floor(s / 3600)} klst síðan`;
  return `${Math.floor(s / 86400)} dögum síðan`;
}

function Sparkline({ data, width = 80, height = 24 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`
  ).join(' ');
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export default function OverviewPage({ onNavigate }) {
  const { data, loading, refetch } = useFetch('/overview');
  const [running, setRunning] = useState(null);

  const runSource = async (name) => {
    setRunning(name);
    try {
      await fetch(`${API}/sources/${name}/run`, { method: 'POST' });
      refetch();
    } catch { }
    setRunning(null);
  };

  if (loading) return <div className="text-gray-500 text-sm p-6">Hleð...</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Skemu', value: data.schemaCount, icon: Layers, color: 'text-blue-400' },
          { label: 'Töflur', value: data.tableCount, icon: Database, color: 'text-emerald-400' },
          { label: 'Raðir', value: data.totalRows?.toLocaleString('is-IS'), icon: Rows3, color: 'text-purple-400' },
          { label: 'Diskur', value: data.diskUsage ? formatBytes(data.diskUsage) : '—', icon: HardDrive, color: 'text-amber-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-800/60 rounded-xl p-5 border border-gray-700/50">
            <div className="flex items-center gap-3 mb-2">
              <Icon className={`w-5 h-5 ${color}`} />
              <span className="text-sm text-gray-400">{label}</span>
            </div>
            <div className="text-3xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Health check */}
      {data.health && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
          data.health.status === 'ok'
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <Activity className="w-4 h-4" />
          <span>Gagnagrunnur: {data.health.current_database} — {data.health.status === 'ok' ? 'tengdur' : 'villa'}</span>
        </div>
      )}

      {/* Sources */}
      <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700/50">
        <h2 className="text-lg font-semibold text-white mb-4">Gagnalindir</h2>
        {data.sources.length === 0 ? (
          <div className="text-sm text-gray-500">Engar keyrslur enn</div>
        ) : (
          <div className="space-y-2">
            {data.sources.map((s) => (
              <div key={s.name} className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onNavigate('source-dashboard', s.name)} className="text-sm font-medium text-white hover:text-blue-400 transition-colors">{s.name}</button>
                    {s.schedule && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">{s.schedule}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {s.lastRun ? (
                      <span title={new Date(s.lastRun).toLocaleString('is-IS')}>{timeAgo(s.lastRun)}</span>
                    ) : 'ekki keyrt'}
                  </div>
                </div>
                {/* Sparkline */}
                {s.history && s.history.length > 1 && (
                  <Sparkline data={s.history.map(h => h.rows)} />
                )}
                {s.lastRows != null && (
                  <span className="text-xs text-gray-500">{s.lastRows.toLocaleString('is-IS')} raðir</span>
                )}
                {s.lastStatus === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : s.lastStatus ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-gray-700" />
                )}
                <button
                  onClick={() => runSource(s.name)}
                  disabled={running === s.name}
                  className={`p-2 rounded-lg transition-colors ${running === s.name
                    ? 'bg-gray-700 text-gray-400 cursor-wait'
                    : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30'
                  }`}
                  title="Keyra"
                >
                  <Play className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schema breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Skemu</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.schemas.map((sc) => (
            <button
              key={sc.name}
              onClick={() => onNavigate('database', sc.name)}
              className="text-left bg-gray-800/60 rounded-xl p-5 border border-gray-700/50 hover:border-blue-500/40 transition-colors group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">{sc.name}</span>
                <span className="text-xs text-gray-500">{sc.tables} töflur</span>
              </div>
              <div className="text-xs text-gray-500 mb-2">{sc.rows.toLocaleString('is-IS')} raðir</div>
              <div className="space-y-1">
                {sc.topTables.map((t) => (
                  <div key={t.table} className="flex justify-between text-xs">
                    <span className="text-gray-400 truncate">{t.table}</span>
                    <span className="text-gray-600 ml-2 flex-shrink-0">{t.rows.toLocaleString('is-IS')}</span>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
