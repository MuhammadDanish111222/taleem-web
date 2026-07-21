import { useState, useEffect, useCallback, useRef } from 'react';

// A simple module-level cache to deduplicate and briefly cache requests.
// Phase 1F requires a clearCatalogueReadCache function.
const cache = new Map<string, { data: any, timestamp: number }>();
const inFlight = new Map<string, Promise<any>>();

export function clearCatalogueReadCache() {
  cache.clear();
}

interface FetchState<T> {
  data: T[] | null;
  loading: boolean;
  error: Error | null;
}

export function useCatalogueOptions<T>(
  fetchKey: string | null,
  fetchFn: () => Promise<T[]>,
  ttlMs = 1000 * 60 * 5 // 5 minutes default
) {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: !!fetchKey,
    error: null,
  });

  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const requestCounter = useRef(0);

  const executeFetch = useCallback(async (key: string, ignoreCache = false) => {
    const currentRequest = ++requestCounter.current;
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      if (!ignoreCache) {
        const cached = cache.get(key);
        if (cached && Date.now() - cached.timestamp < ttlMs) {
          if (currentRequest === requestCounter.current) {
            setState({ data: cached.data as T[], loading: false, error: null });
          }
          return;
        }
      }

      let fetchPromise = inFlight.get(key);
      if (!fetchPromise || ignoreCache) {
        fetchPromise = new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('Network timeout: Firestore is hanging. Please check your internet connection.'));
          }, 8000);
          
          fetchFnRef.current()
            .then(res => {
              clearTimeout(timer);
              resolve(res);
            })
            .catch(err => {
              clearTimeout(timer);
              reject(err);
            });
        });
        inFlight.set(key, fetchPromise);
      }

      const result = await fetchPromise;
      
      if (inFlight.get(key) === fetchPromise) {
          inFlight.delete(key);
      }
      
      cache.set(key, { data: result, timestamp: Date.now() });

      if (currentRequest === requestCounter.current) {
        console.log(`[useCatalogueOptions] Successfully loaded ${key}`, result);
        setState({ data: result, loading: false, error: null });
      } else {
        console.log(`[useCatalogueOptions] Ignored stale result for ${key}`);
      }
    } catch (error) {
      if (inFlight.get(key)) {
        inFlight.delete(key);
      }
      if (currentRequest === requestCounter.current) {
        console.error(`[useCatalogueOptions] Error loading ${key}:`, error);
        setState({ data: null, loading: false, error: error instanceof Error ? error : new Error('Unknown error') });
      }
    }
  }, [ttlMs]);

  useEffect(() => {
    if (!fetchKey) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    executeFetch(fetchKey);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestCounter.current++;
    };
  }, [fetchKey, executeFetch]);

  const retry = useCallback(() => {
    if (fetchKey) {
       cache.delete(fetchKey);
       executeFetch(fetchKey, true);
    }
  }, [fetchKey, executeFetch]);

  return { ...state, retry };
}
