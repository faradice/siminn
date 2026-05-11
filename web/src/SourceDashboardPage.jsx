import { useState, useEffect, useRef } from 'react';
import { useFetch } from './shared';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { ChevronDown, ChevronRight, ArrowLeft, Calendar } from 'lucide-react';

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

function HeroBanner({ history, tables, source, insights }) {
  const [animated, setAnimated] = useState(false);
  const countRef = useRef(null);
  const scoreRef = useRef(null);

  const totalRows = tables.reduce((s, t) => s + t.rows, 0);
  const lastRunRows = history.length > 0 ? (history[history.length - 1].rows || 0) : 0;
  const prevRunRows = history.length > 1 ? (history[history.length - 2].rows || 0) : 0;
  const rowDelta = lastRunRows - prevRunRows;
  const lastSuccess = [...history].reverse().find(h => h.status === 'success');

  // Freshness score
  const successes = history.filter(h => h.status === 'success');
  let expectedMs = 24 * 60 * 60 * 1000;
  if (successes.length >= 2) {
    const times = successes.map(h => new Date(h.started_at).getTime()).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expectedMs = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  }
  const elapsed = successes.length > 0
    ? Date.now() - Math.max(...successes.map(h => new Date(h.started_at).getTime()))
    : expectedMs * 2;
  const freshness = Math.max(0, Math.min(100, 100 * (1 - elapsed / (expectedMs * 2))));
  const freshnessColor = freshness >= 90 ? '#22c55e' : freshness >= 70 ? '#84cc16' : freshness >= 50 ? '#eab308' : '#ef4444';

  const npsInsight = insights?.find(i => i.type === 'nps');
  const ratingInsight = insights?.find(i => i.type === 'rating');
  const hasNps = !!npsInsight;

  // Gauge is NPS when available, freshness otherwise
  const cx = 140, cy = 130, r = 100;
  const totalArcLen = Math.PI * r;
  const normalizedScore = hasNps ? (npsInsight.score + 100) / 200 : freshness / 100;
  const scoreColor = hasNps
    ? (npsInsight.score >= 50 ? '#22c55e' : npsInsight.score >= 20 ? '#84cc16' : npsInsight.score >= 0 ? '#eab308' : '#ef4444')
    : freshnessColor;
  const scoreVerdict = hasNps
    ? (npsInsight.score >= 50 ? 'Framúrskarandi' : npsInsight.score >= 30 ? 'Frábært' : npsInsight.score >= 20 ? 'Mjög gott' : npsInsight.score >= 0 ? 'Gott' : npsInsight.score >= -20 ? 'Viðunandi' : 'Þarfnast úrbóta')
    : (freshness >= 95 ? 'Framúrskarandi' : freshness >= 85 ? 'Frábært' : freshness >= 70 ? 'Gott' : freshness >= 50 ? 'Viðunandi' : 'Þarfnast úrbóta');

  const arcPath = (startDeg, endDeg, radius) => {
    const s = (startDeg * Math.PI) / 180, e = (endDeg * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(Math.PI + s), y1 = cy - radius * Math.sin(Math.PI + s);
    const x2 = cx + radius * Math.cos(Math.PI + e), y2 = cy - radius * Math.sin(Math.PI + e);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${endDeg - startDeg > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  // NPS segment bar
  const npsTotal = hasNps ? npsInsight.total : 0;
  const pPct = npsTotal ? Math.round((npsInsight.promoters / npsTotal) * 100) : 0;
  const paPct = npsTotal ? Math.round((npsInsight.passives / npsTotal) * 100) : 0;
  const dPct = npsTotal ? Math.round((npsInsight.detractors / npsTotal) * 100) : 0;

  // Rating
  const avgAll = ratingInsight?.avg || 0;
  const ratingColor = avgAll >= 4.5 ? '#22c55e' : avgAll >= 4 ? '#84cc16' : avgAll >= 3.5 ? '#eab308' : '#ef4444';

  // Table segments (for non-NPS fallback)
  const sorted = [...tables].sort((a, b) => b.rows - a.rows);
  const top5 = sorted.slice(0, 5);
  const otherRows = sorted.slice(5).reduce((s, t) => s + t.rows, 0);
  const segments = top5.filter(t => t.rows > 0).map(t => ({ name: t.table, rows: t.rows }));
  if (otherRows > 0 && totalRows > 0 && Math.round((otherRows / totalRows) * 100) >= 1) segments.push({ name: 'annað', rows: otherRows });
  const topTables = sorted.slice(0, 3);
  const maxTableRows = topTables.length > 0 ? topTables[0].rows : 1;

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  const heroCount = hasNps ? npsInsight.total : totalRows;

  useEffect(() => {
    if (!animated) return;
    const duration = 1500;
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const animateValue = (el, target, format) => {
      if (!el) return;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const val = Math.round(easeOut(t) * Math.abs(target));
        el.textContent = format(val);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    animateValue(countRef.current, heroCount, v => v.toLocaleString('is-IS'));
    if (hasNps) {
      animateValue(scoreRef.current, npsInsight.score, v =>
        `${npsInsight.score > 0 ? '+' : npsInsight.score < 0 ? '\u2212' : ''}${v}`
      );
    } else {
      animateValue(scoreRef.current, Math.round(freshness), v => `${v}%`);
    }
  }, [animated, heroCount, freshness, hasNps, npsInsight?.score]);

  return (
    <>
      <style>{`@keyframes hero-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      <div className="relative rounded-2xl p-[2px] overflow-hidden">
        <div className="absolute inset-0 rounded-2xl" style={{
          background: `linear-gradient(135deg, ${scoreColor}, #3b82f6, #8b5cf6, ${scoreColor})`,
          opacity: animated ? 0.7 : 0, transition: 'opacity 1.5s ease',
        }} />
        <div className="relative rounded-2xl bg-gradient-to-br from-gray-900 via-[#0c1322] to-gray-900 p-6 lg:p-10 overflow-hidden">
          <div className="absolute top-[-80px] left-[-60px] w-[400px] h-[400px] rounded-full opacity-[0.18] blur-[120px]" style={{ background: scoreColor }} />
          <div className="absolute bottom-[-100px] right-[-80px] w-[350px] h-[350px] rounded-full opacity-[0.08] blur-[120px] bg-blue-500" />

          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-6 lg:gap-12">
            {/* Left stat card */}
            <div className="flex-shrink-0 min-w-[160px]">
              <div className="rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] p-5 space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium flex items-center gap-2">
                    {hasNps ? 'Svör' : 'Raðir'}
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" style={{ animation: 'hero-dot 2s ease-in-out infinite' }} />
                  </div>
                  <div className="text-4xl font-extrabold text-white mt-1 tabular-nums" ref={countRef}>
                    {heroCount.toLocaleString('is-IS')}
                  </div>
                  <div className="text-[11px] text-gray-500">{hasNps ? 'NPS svör' : 'heildarraðir'}</div>
                </div>
                {history.length > 1 && (
                  <div className="border-t border-white/[0.06] pt-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium">Síðasta keyrsla</div>
                    <div className={`text-2xl font-bold mt-1 ${rowDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {rowDelta > 0 ? '+' : ''}{rowDelta.toLocaleString('is-IS')}
                      <span className="text-sm ml-1">{rowDelta >= 0 ? '▲' : '▼'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Center: NPS gauge (or freshness fallback) */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <svg viewBox="0 0 280 170" className="w-[300px] lg:w-[360px]">
                <defs>
                  <filter id="heroGlow2"><feGaussianBlur stdDeviation="8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  <linearGradient id="heroArc2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" /><stop offset="25%" stopColor="#f59e0b" />
                    <stop offset="50%" stopColor="#eab308" /><stop offset="75%" stopColor="#84cc16" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                  <filter id="heroArcGlow2"><feGaussianBlur stdDeviation="5" /></filter>
                </defs>
                <path d={arcPath(0, 180, r)} fill="none" stroke="#1f2937" strokeWidth="22" strokeLinecap="round" />
                <path d={arcPath(0, 180, r)} fill="none" stroke="url(#heroArc2)" strokeWidth="22" strokeLinecap="round"
                  filter="url(#heroArcGlow2)" opacity="0.4"
                  style={{ strokeDasharray: totalArcLen, strokeDashoffset: animated ? totalArcLen * (1 - normalizedScore) : totalArcLen,
                    transition: 'stroke-dashoffset 2s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                <path d={arcPath(0, 180, r)} fill="none" stroke="url(#heroArc2)" strokeWidth="22" strokeLinecap="round"
                  style={{ strokeDasharray: totalArcLen, strokeDashoffset: animated ? totalArcLen * (1 - normalizedScore) : totalArcLen,
                    transition: 'stroke-dashoffset 2s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                <g style={{ transform: `rotate(${animated ? normalizedScore * 180 : 0}deg)`,
                  transformOrigin: `${cx}px ${cy}px`, transition: 'transform 2.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <polygon points={`${cx},${cy - 3.5} ${cx - 78},${cy} ${cx},${cy + 3.5}`} fill="white" opacity="0.9" />
                </g>
                <circle cx={cx} cy={cy} r="7" fill="#111827" stroke="white" strokeWidth="2.5" />
                <text ref={scoreRef} x={cx} y={cy - 28} textAnchor="middle" fill={scoreColor} fontSize="44" fontWeight="800"
                  filter="url(#heroGlow2)">{hasNps ? (npsInsight.score > 0 ? '+' : '') + npsInsight.score : Math.round(freshness) + '%'}</text>
                <text x={cx} y={cy - 8} textAnchor="middle" fill="#6b7280" fontSize="11" fontWeight="500">
                  {hasNps ? 'NPS stig' : 'ferskleiki'}
                </text>
                {hasNps ? (
                  <>
                    <text x="20" y="148" fill="#4b5563" fontSize="9">{'\u2212'}100</text>
                    <text x={cx} y="10" textAnchor="middle" fill="#4b5563" fontSize="9">0</text>
                    <text x="256" y="148" fill="#4b5563" fontSize="9">+100</text>
                  </>
                ) : (
                  <>
                    <text x="28" y="148" fill="#4b5563" fontSize="9">0%</text>
                    <text x={cx} y="10" textAnchor="middle" fill="#4b5563" fontSize="9">50%</text>
                    <text x="250" y="148" fill="#4b5563" fontSize="9">100%</text>
                  </>
                )}
              </svg>
              <div className="-mt-1" style={{ opacity: animated ? 1 : 0, transform: animated ? 'translateY(0)' : 'translateY(8px)',
                transition: 'all 0.6s ease 1.8s' }}>
                <span className="text-sm font-semibold px-4 py-1.5 rounded-full"
                  style={{ color: scoreColor, backgroundColor: `${scoreColor}15`, border: `1px solid ${scoreColor}30` }}>
                  {scoreVerdict}
                </span>
              </div>
            </div>

            {/* Right stat card */}
            <div className="flex-shrink-0 min-w-[160px]">
              <div className="rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] p-5 space-y-4">
                {ratingInsight ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium">Heildareinkunn</div>
                    <div className="text-4xl font-extrabold mt-1" style={{ color: ratingColor }}>
                      {avgAll.toFixed(1)}<span className="text-lg text-gray-500">/5</span>
                    </div>
                    <div className="text-[11px] text-gray-500">meðaleinkunn</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium">Töflur</div>
                    <div className="text-4xl font-extrabold text-white mt-1 tabular-nums">{tables.length}</div>
                    <div className="text-[11px] text-gray-500">í uppsprettu</div>
                  </div>
                )}
                <div className="border-t border-white/[0.06] pt-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium">
                    {hasNps ? 'Ferskleiki' : 'Nýjustu gögn'}
                  </div>
                  {hasNps ? (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="text-lg font-bold tabular-nums" style={{ color: freshnessColor }}>{Math.round(freshness)}%</div>
                      <div className="text-[11px] text-gray-500">{timeAgo(lastSuccess?.started_at)}</div>
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-blue-400 mt-1">{timeAgo(lastSuccess?.started_at)}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* NPS segment bar (when NPS available) or table segment bar */}
          {hasNps ? (
            <div className="relative z-10 mt-8">
              <div className="flex h-3.5 rounded-full overflow-hidden bg-gray-800/80">
                <div className="bg-green-500 transition-all duration-[1800ms] ease-out" style={{ width: animated ? `${pPct}%` : '0%' }} />
                <div className="bg-yellow-500 transition-all duration-[1800ms] ease-out" style={{ width: animated ? `${paPct}%` : '0%' }} />
                <div className="bg-red-500 transition-all duration-[1800ms] ease-out" style={{ width: animated ? `${dPct}%` : '0%' }} />
              </div>
              <div className="flex items-center justify-between mt-2.5 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Stuðningsmenn {pPct}%
                  <span className="text-gray-600">({npsInsight.promoters})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> Hlutlausir {paPct}%
                  <span className="text-gray-600">({npsInsight.passives})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Gagnrýnendur {dPct}%
                  <span className="text-gray-600">({npsInsight.detractors})</span>
                </span>
              </div>
            </div>
          ) : segments.length > 0 && (
            <div className="relative z-10 mt-8">
              <div className="flex h-3.5 rounded-full overflow-hidden bg-gray-800/80">
                {segments.map((seg, i) => (
                  <div key={i} className="transition-all duration-[1800ms] ease-out"
                    style={{ width: animated ? `${totalRows ? (seg.rows / totalRows) * 100 : 0}%` : '0%',
                      backgroundColor: COLORS[i % COLORS.length] }} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-xs text-gray-400">
                {segments.map((seg, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {seg.name} {totalRows ? Math.round((seg.rows / totalRows) * 100) : 0}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top 3 mini cards (only for non-NPS sources) */}
          {!hasNps && topTables.length > 0 && (
            <div className="relative z-10 mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {topTables.map((t, i) => {
                const pct = (t.rows / maxTableRows) * 100;
                const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-green-400' : pct >= 25 ? 'bg-yellow-400' : 'bg-gray-400';
                return (
                  <div key={i} className="bg-white/[0.03] backdrop-blur-sm rounded-lg px-3 py-2.5 border border-white/[0.05]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-gray-400 truncate max-w-[75%]" title={t.table}>{t.table}</span>
                      <span className="text-[11px] font-bold text-white">{t.rows.toLocaleString('is-IS')}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all duration-[1800ms] ease-out`}
                        style={{ width: animated ? `${pct}%` : '0%' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
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

function RatingInsightCard({ insight }) {
  const { avg, count, scale, perQuestion } = insight;
  const pct = (avg / scale) * 100;
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#84cc16' : pct >= 40 ? '#eab308' : '#ef4444';

  return (
    <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700/50">
      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium mb-4">Einkunn</div>
      <div className="flex items-start gap-8">
        <div className="text-center flex-shrink-0">
          <div className="text-5xl font-black tabular-nums" style={{ color }}>{avg.toFixed(2)}</div>
          <div className="text-lg text-gray-500 font-medium">/ {scale}</div>
          <div className="text-xs text-gray-500 mt-1">{count.toLocaleString('is-IS')} svör</div>
        </div>
        {perQuestion.length > 0 && (
          <div className="flex-1 space-y-2.5 min-w-0">
            {perQuestion.map((q, i) => {
              const qPct = (q.avg / scale) * 100;
              const qColor = qPct >= 80 ? 'bg-green-500' : qPct >= 60 ? 'bg-green-400' : qPct >= 40 ? 'bg-yellow-400' : 'bg-red-400';
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-gray-400 truncate max-w-[80%]" title={q.heading}>{q.heading}</span>
                    <span className="text-[11px] font-bold text-white ml-2 flex-shrink-0">{q.avg.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                    <div className={`h-full ${qColor} rounded-full transition-all duration-1000`} style={{ width: `${qPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightCards({ insights }) {
  // NPS is shown in HeroBanner — only render non-NPS insights here
  const filtered = (insights || []).filter(i => i.type !== 'nps');
  if (filtered.length === 0) return null;
  return (
    <div className="space-y-4">
      {filtered.map((ins, i) => {
        if (ins.type === 'rating') return <RatingInsightCard key={i} insight={ins} />;
        return null;
      })}
    </div>
  );
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

function useDebounced(value, ms = 600) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function SourceDashboardPage({ sourceName, onBack }) {
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const debouncedFrom = useDebounced(dateFrom);
  const debouncedTo = useDebounced(dateTo);

  const params = new URLSearchParams();
  if (selectedSurvey) params.set('survey', selectedSurvey);
  if (debouncedFrom) params.set('dateFrom', debouncedFrom);
  if (debouncedTo) params.set('dateTo', debouncedTo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const { data, loading } = useFetch(`/sources/${sourceName}/dashboard${qs}`);

  if (loading) return <div className="text-gray-500 text-sm p-6">Hleð mælaborði...</div>;
  if (!data) return <div className="text-red-400 text-sm p-6">Gat ekki hlaðið mælaborði</div>;

  const { source, history, tables, tableDetails, insights, surveys, responseStats } = data;
  const hasFilters = surveys || responseStats;
  const npsInsight = insights?.find(i => i.type === 'nps');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-white">{sourceName}</h1>
        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">{source.type}</span>
      </div>

      {/* Filters bar */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* Survey picker */}
          {surveys && surveys.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Könnun</span>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setSelectedSurvey(null)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    !selectedSurvey
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : 'bg-gray-800/60 text-gray-400 border-gray-700/50 hover:bg-gray-700/50 hover:text-gray-300'
                  }`}
                >
                  Allar kannanir
                </button>
                {surveys.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSurvey(s.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      selectedSurvey === s.id
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        : 'bg-gray-800/60 text-gray-400 border-gray-700/50 hover:bg-gray-700/50 hover:text-gray-300'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date filter */}
          {responseStats && (
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              <input type="date" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-gray-800/60 border border-gray-700/50 rounded-lg text-xs text-gray-300 px-2.5 py-1.5 focus:outline-none focus:border-blue-500/50"
                placeholder="Frá"
              />
              <span className="text-gray-600 text-xs">&ndash;</span>
              <input type="date" value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-gray-800/60 border border-gray-700/50 rounded-lg text-xs text-gray-300 px-2.5 py-1.5 focus:outline-none focus:border-blue-500/50"
                placeholder="Til"
              />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded border border-gray-700/30 hover:border-gray-600/50">
                  Hreinsa
                </button>
              )}
            </div>
          )}

          {/* Response stats */}
          {responseStats && (
            <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-500">
              <span>{responseStats.total.toLocaleString('is-IS')} svör (lokið)</span>
              {npsInsight && npsInsight.total !== responseStats.total && (
                <span>{npsInsight.total.toLocaleString('is-IS')} NPS svör</span>
              )}
              {responseStats.earliest && new Date(responseStats.earliest).getFullYear() > 2000 && (
                <span title={`${new Date(responseStats.earliest).toLocaleDateString('is-IS')} – ${new Date(responseStats.latest).toLocaleDateString('is-IS')}`}>
                  {new Date(responseStats.earliest).toLocaleDateString('is-IS', { day: 'numeric', month: 'short', year: 'numeric' })} – {new Date(responseStats.latest).toLocaleDateString('is-IS', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <HeroBanner history={history} tables={tables} source={source} insights={insights} />

      <InsightCards insights={insights} />

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
