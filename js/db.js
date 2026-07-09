// Thin promise wrapper around IndexedDB. Stores:
//   items    — one record per learnable item (content + SRS state), keyPath "id"
//   sessions — one record per completed/started daily session, keyPath "id" (date-lang)
//   meta     — settings, adaptive state, misc key/value, keyPath "key"

const DB_NAME = "daily-dojo";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s); // an IDBRequest, or undefined for bulk writes
        t.oncomplete = () => resolve(req instanceof IDBRequest ? req.result : undefined);
        t.onerror = () => reject(t.error);
      })
  );
}

export function dbGet(store, key) {
  return tx(store, "readonly", (s) => s.get(key));
}
export function dbAll(store) {
  return tx(store, "readonly", (s) => s.getAll());
}
export function dbPut(store, value) {
  return tx(store, "readwrite", (s) => s.put(value));
}
export function dbBulkPut(store, values) {
  return tx(store, "readwrite", (s) => {
    values.forEach((v) => s.put(v));
  });
}
export function dbClear(store) {
  return tx(store, "readwrite", (s) => s.clear());
}

// Ask the browser to protect IndexedDB from eviction (best effort).
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch (_) {}
  return false;
}
