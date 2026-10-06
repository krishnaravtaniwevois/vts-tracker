/**
 * Resilient LocalStorage Wrapper with Auto-Prune on QuotaExceededError
 */

const PRUNABLE_KEYS = [
  'vts_fleet_snapshots_v1',
  'vts_ai_fleet_snapshots',
  'vts_ai_chat_history',
  'vts_tracker_chat_history',
  'vts_tracker_renewal_archives'
];

/**
 * Safely writes a key to localStorage with QuotaExceeded protection.
 * If quota is reached, non-critical cache entries are pruned automatically.
 */
export function safeSetItem(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const serialized = typeof value === 'string' ? value : JSON.stringify(value);

  try {
    localStorage.setItem(key, serialized);
  } catch (err) {
    console.warn(`[Storage] Quota exceeded while setting "${key}". Pruning non-critical caches...`, err);
    try {
      // Prune bulky AI & history caches to free space
      for (const prunable of PRUNABLE_KEYS) {
        if (prunable !== key) {
          localStorage.removeItem(prunable);
        }
      }
      // Retry once after pruning
      localStorage.setItem(key, serialized);
      console.info(`[Storage] Successfully saved "${key}" after pruning old caches.`);
    } catch (retryErr) {
      console.error(`[Storage] Critical: Unable to save "${key}" even after pruning:`, retryErr);
    }
  }
}

/**
 * Safely reads a JSON-parsed or raw string from localStorage.
 */
export function safeGetItem(key, fallback = null) {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;

  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return raw;
  } catch (err) {
    console.warn(`[Storage] Failed to read "${key}":`, err);
    return fallback;
  }
}

/**
 * Safely parses JSON from localStorage, returning fallback on any syntax error.
 */
export function safeGetJson(key, fallback = null) {
  const raw = safeGetItem(key, null);
  if (raw === null) return fallback;

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[Storage] Failed to parse JSON for "${key}":`, err);
    return fallback;
  }
}

/**
 * Safely removes an item from localStorage.
 */
export function safeRemoveItem(key) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[Storage] Failed to remove "${key}":`, err);
  }
}

// Global safety fallback for browser runtime
if (typeof window !== 'undefined') {
  window.safeSetItem = safeSetItem;
  window.safeGetItem = safeGetItem;
  window.safeGetJson = safeGetJson;
  window.safeRemoveItem = safeRemoveItem;
}
