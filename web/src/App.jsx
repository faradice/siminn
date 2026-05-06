import { useState } from 'react';
import Layout from './Layout';
import OverviewPage from './OverviewPage';
import SourcesPage from './SourcesPage';
import DatabasePage from './DatabasePage';

export default function App() {
  const [page, setPage] = useState('overview');
  const [dbSchema, setDbSchema] = useState(null);

  const navigate = (p, schema) => {
    setPage(p);
    setDbSchema(schema || null);
  };

  return (
    <Layout page={page} onNavigate={navigate}>
      {page === 'overview' && <OverviewPage onNavigate={navigate} />}
      {page === 'sources' && <SourcesPage />}
      {page === 'database' && <DatabasePage initialSchema={dbSchema} />}
    </Layout>
  );
}
