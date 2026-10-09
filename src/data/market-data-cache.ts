import { Asset, DatasetMetadata } from '../types/risk';

export interface CachedSeries {
  id: string;
  name: string;
  savedAt: string;
  metadata: DatasetMetadata;
  assets: Asset[];
  dates: string[];
}

export interface CachedSeriesSummary {
  id: string;
  name: string;
  savedAt: string;
  observationCount: number;
  assetCount: number;
  dateRange: string;
  hash: string;
  source: string;
}

const DB_NAME = 'quantrisk_market_cache';
const DB_VERSION = 1;
const STORE_NAME = 'historical_datasets';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist market data series to browser IndexedDB
 */
export async function saveMarketSeries(dataset: CachedSeries): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(dataset);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB save failed, falling back to sessionStorage:', err);
    try {
      sessionStorage.setItem(`dataset_${dataset.id}`, JSON.stringify(dataset));
    } catch {
      // ignore storage quota issues
    }
  }
}

/**
 * Retrieve cached dataset by ID
 */
export async function getMarketSeries(id: string): Promise<CachedSeries | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    const fallback = sessionStorage.getItem(`dataset_${id}`);
    if (fallback) {
      try {
        return JSON.parse(fallback);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * List all saved datasets in cache
 */
export async function listMarketSeries(): Promise<CachedSeriesSummary[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results: CachedSeries[] = req.result || [];
        const summaries: CachedSeriesSummary[] = results.map((d) => ({
          id: d.id,
          name: d.name,
          savedAt: d.savedAt,
          observationCount: d.metadata.observationCount,
          assetCount: d.assets.length,
          dateRange: d.metadata.dateRange,
          hash: d.metadata.hash,
          source: d.metadata.source,
        }));
        resolve(summaries);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * Delete cached dataset
 */
export async function deleteMarketSeries(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    sessionStorage.removeItem(`dataset_${id}`);
  }
}
