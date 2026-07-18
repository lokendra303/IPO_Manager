import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../utils/errors';

type Options = {
  enabled?: boolean;
  /** Keep last successful result across remounts for this key */
  cacheKey?: string;
};

const memoryCache = new Map<string, unknown>();

export function clearQueryCache(cacheKey?: string) {
  if (cacheKey) memoryCache.delete(cacheKey);
  else memoryCache.clear();
}

export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  options: Options = {}
) {
  const enabled = options.enabled !== false;
  const cacheKey = options.cacheKey;

  const cached = cacheKey ? (memoryCache.get(cacheKey) as T | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const dataRef = useRef(data);
  dataRef.current = data;

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled) return null;

      const hasData = dataRef.current != null || (cacheKey ? memoryCache.has(cacheKey) : false);
      const silent = opts?.silent === true || hasData;

      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const fresh = await fetcherRef.current();
        setData(fresh);
        if (cacheKey) memoryCache.set(cacheKey, fresh);
        return fresh;
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load data'));
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, cacheKey]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load, ...deps]);

  const refresh = useCallback(() => load({ silent: true }), [load]);

  return { data, setData, loading, refreshing, error, refresh, reload: load };
}
