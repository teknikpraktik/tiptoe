/** Deterministiska hashar för den delade världen: samma indata ger samma tal på alla enheter (ingen Math.random, inga flyttalsberoenden). */
export function hash32(...parts: (string | number)[]): number {
  // FNV-1a över texten, sedan murmur3-avslutning för bättre spridning.
  let h = 0x811c9dc5;
  const s = parts.map((p) => (typeof p === "number" ? (Number.isInteger(p) ? String(p) : p.toFixed(6)) : p)).join("|");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** Kort, läsbart id ur en hash. */
export const idOf = (h: number, prefix = "a") => `${prefix}${h.toString(36).padStart(7, "0")}`;
