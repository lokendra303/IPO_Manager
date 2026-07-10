import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../utils/errors';

type Options = {
  enabled?: boolean;
};

export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  options: Options = {}
) {
  const enabled = options.enabled !== false;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled) return null;

      if (!opts?.silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const fresh = await fetcherRef.current();
        setData(fresh);
        return fresh;
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load data'));
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled]
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
