import { useState, useEffect, useCallback } from 'react';

const API = '/api';

export function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const refetch = useCallback(() => {
    setLoading(true);
    fetch(API + url).then(r => r.json()).then(r => { setData(r.data); setLoading(false); });
  }, [url]);
  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, refetch };
}

export { API };
