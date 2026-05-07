import { useState } from 'react';
import { LayoutDashboard, Plug, Database, Settings, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

const NAV = [
  { key: 'overview', label: 'Yfirlit', icon: LayoutDashboard },
  { key: 'sources', label: 'Uppsprettur', icon: Plug },
  { key: 'database', label: 'Gagnagrunnur', icon: Database },
];

export default function Layout({ page, onNavigate, sourceName, onBack, children }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="min-h-screen bg-[#0f1117] flex">
      {/* Sidebar */}
      <aside className={`flex flex-col bg-gray-950 border-r border-gray-800 transition-all duration-200 ${expanded ? 'w-56' : 'w-16'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            S
          </div>
          {expanded && (
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">simipipe</div>
              <div className="text-[10px] text-gray-600 truncate">source → database</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              title={expanded ? undefined : label}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${page === key || (key === 'overview' && page === 'source-dashboard')
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {expanded && <span>{label}</span>}
            </button>
          ))}
        </nav>

        {/* Settings (bottom) */}
        <div className="px-2 pb-2">
          <button
            onClick={() => onNavigate('settings')}
            title={expanded ? undefined : 'Stillingar'}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${page === 'settings'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {expanded && <span>Stillingar</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-center py-4 border-t border-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
        >
          {expanded ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-4">
              <ArrowLeft className="w-4 h-4" /> Til baka
            </button>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
