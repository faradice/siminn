import { useState } from 'react';
import { useFetch } from './shared';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Database, Rows3, Clock, Activity, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';

const COLORS = ['#60a5fa', '#34d399', '#a78bfa', '#fbbf24', '#f87171', '#2dd4bf', '#f472b6', '#fb923c'];
const TOOLTIP_STYLE = { contentStyle: { background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }, itemStyle: { color: '#d1d5db' }, labelStyle: { color: '#9ca3af' } };
const AXIS_TICK = { fill: '#6b7280', fontSize: 11 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#1f2937' };

function timeAgo(date) {
  if (!date) return 'aldrei';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'rétt í þessu';
  if (s < 3600) return `${Math.floor(s / 60)} mín síðan`;
  if (s < 86400) return `${Math.floor(s / 3600)} klst síðan`;
  return `${Math.floor(s / 86400)} dögum síðan`;
}

function KpiCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-5 border border-gray-700/50">
      <div className="flex items-center gap-3 mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}

function TypeBadge({ type }) {
  const colors = {
    integer: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    bigint: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    numeric: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    'double precision': 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    text: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    'character varying': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    'timestamp with time zone': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    'timestamp without time zone': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    date: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    boolean: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  };
  const short = type.replace('character varying', 'varchar').replace('timestamp with time zone', 'timestamptz').replace('timestamp without time zone', 'timestamp').replace('double precision', 'float8');
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[type] || 'bg-gray-700/50 text-gray-400 border-gray-600/50'}`}>
      {short}
    </span>
  );
}

function ColumnChart({ chart }) {
  if (!chart) return null;

  if (chart.type === 'histogram') {
    return (
      <div>
        <div className="text-[10px] text-gray-500 mb-1">
          min {chart.stats.min?.toFixed(1)} · max {chart.stats.max?.toFixed(1)} · meðal {chart.stats.avg?.toFixed(1)}
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chart.bins} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="label" tick={AXIS_TICK} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Bar dataKey="count" fill="#60a5fa" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.type === 'timeseries') {
    const data = chart.series.map(s => ({ date: new Date(s.date).toLocaleDateString('is-IS', { month: 'short', day: 'numeric' }), count: s.count }));
    return (
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="date" tick={AXIS_TICK} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} />
          <Tooltip {...TOOLTIP_STYLE} />
          <defs>
            <linearGradient id="tsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="count" stroke="#34d399" fill="url(#tsGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'categorical') {
    return (
      <ResponsiveContainer width="100%" height={Math.max(80, chart.values.length * 28)}>
        <BarChart data={chart.values} layout="vertical" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" tick={AXIS_TICK} />
          <YAxis type="category" dataKey="value" tick={AXIS_TICK} width={100} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Bar dataKey="count" fill="#a78bfa" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

function TableCard({ name, rows, columns }) {
  const [open, setOpen] = useState(false);
  const charted = columns.filter(c => c.chart);

  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-gray-700/30 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        <span className="text-sm font-medium text-white">{name}</span>
        <span className="text-xs text-gray-500">{rows.toLocaleString('is-IS')} raðir</span>
        <span className="text-xs text-gray-600 ml-auto">{columns.length} dálkar · {charted.length} gröf</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Column type badges */}
          <div className="flex flex-wrap gap-1.5">
            {columns.map(c => (
              <div key={c.name} className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">{c.name}</span>
                <TypeBadge type={c.type} />
              </div>
            ))}
          </div>
          {/* Charts grid */}
          {charted.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {charted.map(c => (
                <div key={c.name} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                  <div className="text-xs font-medium text-gray-300 mb-2">{c.name}</div>
                  <ColumnChart chart={c.chart} />
                </div>
              ))}
            </div>
          )}
          {charted.length === 0 && (
            <div className="text-xs text-gray-600">Engin sjálfvirk gröf — eingöngu háfjölda textadálkar</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SourceDashboardPage({ sourceName, onBack }) {
  const { data, loading } = useFetch(`/sources/${sourceName}/dashboard`);

  if (loading) return <div className="text-gray-500 text-sm p-6">Hleð mælaborði...</div>;
  if (!data) return <div className="text-red-400 text-sm p-6">Gat ekki hlaðið mælaborði</div>;

  const { source, history, tables, tableDetails } = data;
  const totalRows = tables.reduce((s, t) => s + t.rows, 0);
  const lastRunRows = history.length > 0 ? history[history.length - 1].rows || 0 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{sourceName}</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">{source.type}</span>
            {source.schedule && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{source.schedule}</span>
            )}
            {source.lastStatus && (
              <span className={`text-xs px-2 py-0.5 rounded ${source.lastStatus === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {source.lastStatus}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 mt-0.5">Síðasta keyrsla: {timeAgo(source.lastRun)}</div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Database} label="Töflur" value={tables.length} color="text-blue-400" />
        <KpiCard icon={Rows3} label="Heildarraðir" value={totalRows.toLocaleString('is-IS')} color="text-emerald-400" />
        <KpiCard icon={Clock} label="Síðasta keyrsla" value={timeAgo(source.lastRun)} color="text-purple-400" />
        <KpiCard icon={Activity} label="Raðir í síðustu" value={lastRunRows.toLocaleString('is-IS')} color="text-amber-400" />
      </div>

      {/* Run history chart */}
      {history.length > 1 && (
        <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700/50">
          <h2 className="text-sm font-semibold text-white mb-4">Keyrslusaga</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={history.map(h => ({
              date: new Date(h.started_at).toLocaleDateString('is-IS', { day: 'numeric', month: 'short' }),
              rows: h.rows || 0,
              status: h.status,
            }))} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="date" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip {...TOOLTIP_STYLE} />
              <defs>
                <linearGradient id="runGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="rows" stroke="#60a5fa" fill="url(#runGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table row distribution */}
      {tables.length > 0 && (
        <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700/50">
          <h2 className="text-sm font-semibold text-white mb-4">Dreifing raða eftir töflu</h2>
          <ResponsiveContainer width="100%" height={Math.max(120, tables.length * 36)}>
            <BarChart data={tables} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis type="number" tick={AXIS_TICK} />
              <YAxis type="category" dataKey="table" tick={AXIS_TICK} width={140} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v.toLocaleString('is-IS'), 'raðir']} />
              <Bar dataKey="rows" radius={[0, 4, 4, 0]}>
                {tables.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-table detail cards */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-4">Töflur</h2>
        <div className="space-y-3">
          {tables.map((t) => (
            <TableCard key={t.table} name={t.table} rows={t.rows} columns={tableDetails[t.table] || []} />
          ))}
        </div>
      </div>
    </div>
  );
}
