import { useState } from 'react';
import Layout from './Layout';
import OverviewPage from './OverviewPage';
import SourcesPage from './SourcesPage';
import DatabasePage from './DatabasePage';
import SourceDashboardPage from './SourceDashboardPage';

export default function App() {
  const [page, setPage] = useState('overview');
  const [dbSchema, setDbSchema] = useState(null);
  const [sourceName, setSourceName] = useState(null);

  const navigate = (p, extra) => {
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

  return (
    <Layout page={page} onNavigate={navigate} sourceName={sourceName}>
      {page === 'overview' && <OverviewPage onNavigate={navigate} />}
      {page === 'sources' && <SourcesPage onNavigate={navigate} />}
      {page === 'database' && <DatabasePage initialSchema={dbSchema} />}
      {page === 'source-dashboard' && <SourceDashboardPage sourceName={sourceName} onBack={() => navigate('overview')} />}
    </Layout>
  );
}
