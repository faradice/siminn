import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, XCircle, Loader2, Trash2, Plus, KeyRound } from 'lucide-react';
import { API } from './shared';

export default function SettingsPage() {
  const [form, setForm] = useState({ host: '', port: '', database: '', user: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [secrets, setSecrets] = useState([]);
  const [editing, setEditing] = useState(null); // full secret object being edited
  const [secretMsg, setSecretMsg] = useState(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetch(`${API}/settings`).then(r => r.json()).then(d => {
      if (d.data?.database) setForm(d.data.database);
    }).catch(() => {});
    loadSecrets();
  }, []);

  const loadSecrets = () => {
    fetch(`${API}/secrets`).then(r => r.json()).then(d => setSecrets(d.data || [])).catch(() => {});
  };

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

  const openSecret = async (name) => {
    const r = await fetch(`${API}/secrets/${name}`);
    const { data } = await r.json();
    setEditing(data);
    setSecretMsg(null);
  };

  const saveSecret = async () => {
    if (!editing?.name) return;
    setSecretMsg(null);
    try {
      const r = await fetch(`${API}/secrets/${editing.name}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const d = await r.json();
      setSecretMsg(d.ok ? 'Vistað' : d.error || 'Villa');
      loadSecrets();
    } catch (e) { setSecretMsg(e.message); }
    setTimeout(() => setSecretMsg(null), 3000);
  };

  const deleteSecret = async (name) => {
    await fetch(`${API}/secrets/${name}`, { method: 'DELETE' });
    loadSecrets();
    if (editing?.name === name) setEditing(null);
  };

  const createSecret = () => {
    const name = newName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!name) return;
    const s = { name, urls: [''], oauth2: { tokenUrl: '', clientId: '', clientSecret: '', username: '', password: '' } };
    setEditing(s);
    setNewName('');
    setSecretMsg(null);
  };

  const setOA = (k, v) => setEditing(e => ({ ...e, oauth2: { ...e.oauth2, [k]: v } }));
  const setUrl = (i, v) => setEditing(e => ({ ...e, urls: e.urls.map((u, j) => j === i ? v : u) }));
  const addUrl = () => setEditing(e => ({ ...e, urls: [...(e.urls || []), ''] }));
  const removeUrl = (i) => setEditing(e => ({ ...e, urls: e.urls.filter((_, j) => j !== i) }));

  const inputCls = 'w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white">Stillingar</h1>

      {/* Database */}
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

      {/* Secrets */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-6 max-w-2xl">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Leynilyklar
        </h2>

        {/* List */}
        <div className="space-y-2 mb-4">
          {secrets.map(s => (
            <div key={s.name} className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700/30">
              <button onClick={() => openSecret(s.name)} className="flex-1 text-left text-sm text-white hover:text-blue-400 transition-colors font-medium">
                {s.name}
              </button>
              <span className="text-[10px] text-gray-500">{s.urls?.length || 0} URLs</span>
              {s.hasOAuth && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">OAuth2</span>}
              <button onClick={() => deleteSecret(s.name)} className="text-gray-600 hover:text-red-400 transition-colors" title="Eyða">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {secrets.length === 0 && <div className="text-sm text-gray-600">Engir leynilyklar vistaðir</div>}
        </div>

        {/* Add new */}
        <div className="flex gap-2 mb-4">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nýtt heiti (t.d. creditinfo)"
            className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            onKeyDown={e => e.key === 'Enter' && createSecret()} />
          <button onClick={createSecret} disabled={!newName.trim()}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-30 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Bæta við
          </button>
        </div>

        {/* Editor */}
        {editing && (
          <div className="p-4 bg-gray-900/40 rounded-lg border border-gray-700/30 space-y-3">
            <div className="text-sm font-medium text-white">{editing.name}</div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">URLs</label>
              {editing.urls?.map((u, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input value={u} onChange={e => setUrl(i, e.target.value)} placeholder="https://api.example.com/endpoint" className={inputCls} />
                  {editing.urls.length > 1 && (
                    <button onClick={() => removeUrl(i)} className="text-gray-600 hover:text-red-400 px-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
              <button onClick={addUrl} className="text-xs text-gray-500 hover:text-gray-300 mt-1 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Bæta við URL
              </button>
            </div>

            <div className="border-t border-gray-700/30 pt-3">
              <label className="block text-xs text-gray-500 mb-2">OAuth2</label>
              <div className="grid grid-cols-2 gap-2">
                <input value={editing.oauth2?.tokenUrl || ''} onChange={e => setOA('tokenUrl', e.target.value)} placeholder="Token URL" className={inputCls + ' col-span-2'} />
                <input value={editing.oauth2?.clientId || ''} onChange={e => setOA('clientId', e.target.value)} placeholder="Client ID" className={inputCls} />
                <input value={editing.oauth2?.clientSecret || ''} onChange={e => setOA('clientSecret', e.target.value)} placeholder="Client Secret" type="password" className={inputCls} />
                <input value={editing.oauth2?.username || ''} onChange={e => setOA('username', e.target.value)} placeholder="Username" className={inputCls} />
                <input value={editing.oauth2?.password || ''} onChange={e => setOA('password', e.target.value)} placeholder="Password" type="password" className={inputCls} />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button onClick={saveSecret} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors">Vista</button>
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors">Loka</button>
              {secretMsg && <span className={`text-sm ${secretMsg === 'Vistað' ? 'text-emerald-400' : 'text-red-400'}`}>{secretMsg}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
