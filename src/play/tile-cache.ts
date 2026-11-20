import type { TileFetcher } from "@/geo/blockers";
import type { Db } from "@/storage/idb";

/**
 * Vektortiles för miljö och hinder cachas lokalt (spec: lagret `tiles`; hämtas bara runt spelaren, ingen massnedladdning). Nyckeln har
 * OpenFreeMaps datumversion först, så att en ny version inte blandas med gammal data. Högst `max` rutor sparas.
 */
interface CachedTile { key: string; at: number; bytes: Uint8Array | null }

export function cachedFetcher(db: Db | null, fetchTile: TileFetcher, version: () => Promise<string>, max = 400): TileFetcher {
  if (!db) return fetchTile;
  const st = db.store<CachedTile>("tiles");
  let writes = 0;
  return async (z, x, y) => {
    const v = await version().catch(() => "unknown");
    const key = `${v}/${z}/${x}/${y}`;
    const hit = await st.get(key).catch(() => undefined);
    if (hit) return hit.bytes;
    const bytes = await fetchTile(z, x, y);
    await st.put(key, { key, at: Date.now(), bytes }).catch(() => undefined);
    if (++writes % 20 === 0) void prune(st, max);
    return bytes;
  };
}

async function prune(st: ReturnType<Db["store"]>, max: number) {
  const all = (await st.all()) as CachedTile[];
  if (all.length <= max) return;
  for (const t of all.sort((a, b) => a.at - b.at).slice(0, all.length - max)) await st.delete(t.key);
}
