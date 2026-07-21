import { StorageError } from "./errors";

// Expose delay for testing purposes
export let sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Aborted"));
    
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abortHandler);
      resolve();
    }, ms);
    
    const abortHandler = () => {
      clearTimeout(timeout);
      reject(new Error("Aborted"));
    };
    
    signal?.addEventListener("abort", abortHandler);
  });

export function setSleepForTesting(newSleep: (ms: number, signal?: AbortSignal) => Promise<void>) {
  sleep = newSleep;
}

export async function withBoundedRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  signal?: AbortSignal
): Promise<T> {
  let attempt = 1;

  while (true) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    try {
      return await operation();
    } catch (e: any) {
      if (attempt >= maxAttempts) {
        throw sanitizeError(e);
      }

      const retryAfter = getRetryAfterMs(e);
      if (retryAfter !== undefined) {
        await sleep(Math.min(retryAfter, 10000), signal); // Cap retry-after
      } else if (isTransientError(e)) {
        const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
        await sleep(backoff, signal);
      } else {
        throw sanitizeError(e);
      }

      attempt++;
    }
  }
}

function getRetryAfterMs(e: any): number | undefined {
  if (e?.response?.headers?.["retry-after"]) {
    const header = e.response.headers["retry-after"];
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  return undefined;
}

function isTransientError(e: any): boolean {
  const status = e?.status || e?.response?.status;
  if (status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const code = e?.code || e?.cause?.code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT") {
    return true;
  }
  return false;
}

function sanitizeError(e: any): Error {
  if (e instanceof StorageError) return e;
  
  const status = e?.status || e?.response?.status;
  if (status === 404) {
    return new StorageError("STORAGE_NOT_FOUND", "Object not found in storage", e?.message);
  }
  if (status === 403 || status === 401) {
    return new StorageError("STORAGE_PERMISSION_DENIED", "Permission denied accessing storage object", e?.message);
  }
  if (status === 416) {
    return new StorageError("STORAGE_RANGE_INVALID", "Requested byte range is invalid", e?.message);
  }
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return new StorageError("STORAGE_UNAVAILABLE", "Storage provider temporarily unavailable", e?.message);
  }
  if (e?.code === "ETIMEDOUT") {
    return new StorageError("STORAGE_TIMEOUT", "Storage provider request timed out", e?.message);
  }
  return new StorageError("STORAGE_UNAVAILABLE", "Storage provider operation failed", e?.message);
}
