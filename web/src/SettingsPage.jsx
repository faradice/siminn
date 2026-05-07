import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { API } from './shared';

export default function SettingsPage() {
  const [form, setForm] = useState({ host: '', port: '', database: '', user: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    fetch(`${API}/settings`).then(r => r.json()).then(d => {
      if (d.data?.database) setForm(d.data.database);
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/settings/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setTestResult(await r.json());
    } catch (e) { setTestResult({ ok: false, error: e.message }); }
    setTesting(false);
  };

  const save = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const r = await fetch(`${API}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: form }),
      });
      const d = await r.json();
      setSaveMsg(d.ok ? 'Vistað' : d.error || 'Villa');
    } catch (e) { setSaveMsg(e.message); }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const inputCls = 'w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors';

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Stillingar</h1>

      <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-6 max-w-lg">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Gagnagrunnur</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Host</label>
            <input className={inputCls} value={form.host} onChange={e => set('host', e.target.value)} placeholder="localhost" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Port</label>
            <input className={inputCls} type="number" value={form.port} onChange={e => set('port', e.target.value)} placeholder="5432" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Database</label>
            <input className={inputCls} value={form.database} onChange={e => set('database', e.target.value)} placeholder="simipipe" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">User</label>
            <input className={inputCls} value={form.user} onChange={e => set('user', e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Password</label>
            <div className="relative">
              <input className={inputCls + ' pr-10'} type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} placeholder="optional" />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {testResult && (
          <div className={`mt-4 flex items-center gap-2 text-sm ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span>{testResult.ok ? 'Tenging tókst' : testResult.error}</span>
          </div>
        )}

        <div className="flex items-center gap-3 mt-5">
          <button onClick={testConnection} disabled={testing}
            className="px-4 py-2 text-sm rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
            Prófa tengingu
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Vista
          </button>
          {saveMsg && <span className={`text-sm ${saveMsg === 'Vistað' ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}
