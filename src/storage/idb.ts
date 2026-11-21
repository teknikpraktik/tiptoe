// Origin: teknikpraktik/solosurvival@033a121 src/play/idb.ts
/** Minimal IndexedDB-omslutning (inga beroenden). En databas, flera objektlager med string-nycklar. */
export const DB_NAME = "tiptoe";
export const DB_VERSION = 1;
/** Lager enligt specen (Profiler, språk och lagring → Lagring). v1: första schemat. */
export const STORES = ["profiles", "walks", "reserves", "observations", "photos", "world", "tiles", "meta"] as const;
export type StoreName = (typeof STORES)[number];

export interface KvStore<T = unknown> {
  get(key: string): Promise<T | undefined>;
  put(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Promise<T[]>;
  /** Values whose key starts with `prefix`, in key order. */
  range(prefix: string): Promise<T[]>;
  /** Deletes every entry whose key starts with `prefix`. */
  deleteRange(prefix: string): Promise<void>;
  clear(): Promise<void>;
}

export interface Db {
  store<T = unknown>(name: StoreName): KvStore<T>;
  close(): void;
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

/** `onClosed`: anropas när anslutningen stängs för att databasen raderas eller uppgraderas utifrån (Tiptoe: appen laddar då om). */
export function openDb(factory: IDBFactory = indexedDB, name = DB_NAME, onClosed?: () => void): Promise<Db> {
  return new Promise((resolve, reject) => {
    const open = factory.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      // Framtida schemaändringar läggs till här med if (event.oldVersion < n). Befintlig data tas aldrig bort här.
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("The database is blocked by another tab."));
    open.onsuccess = () => {
      const db = open.result;
      // Stängd utifrån (raderad eller uppgraderad i en annan flik): med `onClosed` (appen laddar om) väntar operationerna i stället för att kasta
      // under glappet före omladdningen; utan väntar de inte utan kastar som förut.
      let closedByOther = false;
      db.onversionchange = () => { db.close(); closedByOther = !!onClosed; onClosed?.(); };
      const wait = <R>(f: () => Promise<R>): Promise<R> => (closedByOther ? new Promise<R>(() => undefined) : f());
      resolve({
        close: () => db.close(),
        store<T>(storeName: StoreName): KvStore<T> {
          const tx = (mode: IDBTransactionMode) => db.transaction(storeName, mode).objectStore(storeName);
          return {
            get: (k) => wait(() => req(tx("readonly").get(k)) as Promise<T | undefined>),
            put: (k, v) => wait(async () => void (await req(tx("readwrite").put(v, k)))),
            delete: (k) => wait(async () => void (await req(tx("readwrite").delete(k)))),
            all: () => wait(() => req(tx("readonly").getAll()) as Promise<T[]>),
            range: (prefix) => wait(() => req(tx("readonly").getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"))) as Promise<T[]>),
            deleteRange: (prefix) => wait(async () => void (await req(tx("readwrite").delete(IDBKeyRange.bound(prefix, prefix + "\uffff"))))),
            clear: () => wait(async () => void (await req(tx("readwrite").clear()))),
          };
        },
      });
    };
  });
}

/** Försöker öppna databasen; returnerar null om IndexedDB saknas eller är blockerat (t.ex. privat läge). */
export async function tryOpenDb(factory?: IDBFactory, name = DB_NAME, onClosed?: () => void): Promise<Db | null> {
  try {
    const f = factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    return f ? await openDb(f, name, onClosed) : null;
  } catch {
    return null;
  }
}
