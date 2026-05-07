import { useState } from 'react';
import Layout from './Layout';
import OverviewPage from './OverviewPage';
import SourcesPage from './SourcesPage';
import DatabasePage from './DatabasePage';
import SourceDashboardPage from './SourceDashboardPage';
import SettingsPage from './SettingsPage';

export default function App() {
  const [page, setPage] = useState('overview');
  const [dbSchema, setDbSchema] = useState(null);
  const [sourceName, setSourceName] = useState(null);
  const [history, setHistory] = useState([]);

  const navigate = (p, extra) => {
    setHistory(h => [...h, { page, dbSchema, sourceName }]);
    setPage(p);
    if (p === 'source-dashboard') {
      setSourceName(typeof extra === 'string' ? extra : extra?.source || null);
    } else if (p === 'database') {
      setDbSchema(typeof extra === 'string' ? extra : extra?.schema || null);
    } else {
      setDbSchema(null);
      setSourceName(null);
    }
  };

  const goBack = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setPage(prev.page);
    setDbSchema(prev.dbSchema);
    setSourceName(prev.sourceName);
  };

  return (
    <Layout page={page} onNavigate={navigate} sourceName={sourceName} onBack={history.length > 0 ? goBack : null}>
      {page === 'overview' && <OverviewPage onNavigate={navigate} />}
      {page === 'sources' && <SourcesPage onNavigate={navigate} />}
      {page === 'database' && <DatabasePage initialSchema={dbSchema} />}
      {page === 'source-dashboard' && <SourceDashboardPage sourceName={sourceName} onBack={goBack} />}
      {page === 'settings' && <SettingsPage />}
    </Layout>
  );
}
