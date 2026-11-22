/**
 * Kartans målade texturer, ritade i koden (inga bildfiler eller sprites att hämta): papper, akvarellvask och trädprickar.
 * Alla är sömlösa (brus med periodiskt rutnät) och deterministiska, så att kartan ser likadan ut varje gång.
 */
export interface Texture { width: number; height: number; data: Uint8Array }

/** Heltalshash → 0..1. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Sömlöst värdebrus: rutnätet har perioden `p` celler över bildens sida. */
function noise(u: number, v: number, p: number, seed: number): number {
  const x = u * p, y = v * p;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const m = (i: number) => ((i % p) + p) % p;
  const a = hash(m(x0), m(y0), seed), b = hash(m(x0 + 1), m(y0), seed), c = hash(m(x0), m(y0 + 1), seed), d = hash(m(x0 + 1), m(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fraktalt brus 0..1 (oktaver med dubblad period). */
function fbm(u: number, v: number, p: number, seed: number, octaves = 4): number {
  let s = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) { s += amp * noise(u, v, p << o, seed + o); norm += amp; amp *= 0.5; }
  return s / norm;
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Papper: varm grundton med fläckigt brus och fina fibrer. Opakt, används som bakgrund. */
export function paperTexture(base = "#f3ecdc", size = 256): Texture {
  const [r, g, b] = hex(base);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const blot = (fbm(u, v, 4, 11) - 0.5) * 14;
    const grain = (hash(x, y, 7) - 0.5) * 7;
    const fiber = (noise(u, v * 0.15, 64, 3) - 0.5) * 5;
    const k = blot + grain + fiber;
    const i = (y * size + x) * 4;
    data[i] = clamp(r + k); data[i + 1] = clamp(g + k); data[i + 2] = clamp(b + k * 1.1); data[i + 3] = 255;
  }
  return { width: size, height: size, data };
}

/**
 * Akvarellvask: moln av ljusare och mörkare pigment. RGB är en ton (vit eller mörk), alfa styrs av bruset. Läggs ovanpå en ytas
 * grundfärg så att den blir ojämn som målad.
 */
export function washTexture(tone: string, strength = 1, seed = 1, size = 256): Texture {
  const [r, g, b] = hex(tone);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = fbm(u, v, 3, seed, 5);
    // Kontrast: tydliga moln med mjuka kanter, plus en svag kornighet där pigmentet lägger sig.
    const cloud = Math.max(0, Math.min(1, (n - 0.42) * 3.2));
    const grain = hash(x, y, seed + 99) * 0.18;
    const i = (y * size + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = clamp((cloud * 0.8 + grain) * 255 * strength);
  }
  return { width: size, height: size, data };
}

/**
 * Målad yta (opak): grundfärg med mörkare och ljusare pigmentmoln och korn. Opak, så att överlappande polygoner (t.ex. sjö och hav, eller
 * tile-kanter) inte syns som skarvar.
 */
export function paintedTexture(base: string, dark: string, light: string, seed: number, size = 256): Texture {
  const c0 = hex(base), cd = hex(dark), cl = hex(light);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = fbm(u, v, 3, seed, 5) - 0.5;
    const grain = (hash(x, y, seed + 7) - 0.5) * 0.12;
    const t = Math.max(-1, Math.min(1, n * 2.6 + grain));
    const tgt = t < 0 ? cd : cl, k = Math.abs(t) * 0.55;
    const i = (y * size + x) * 4;
    for (let j = 0; j < 3; j++) data[i + j] = clamp(c0[j] + (tgt[j] - c0[j]) * k);
    data[i + 3] = 255;
  }
  return { width: size, height: size, data };
}

/** Trädkronor: små rundade prickar i mörkare grönt med ljusare topp, utspridda på genomskinlig botten (för skog). */
export function treeTexture(size = 96): Texture {
  const data = new Uint8Array(size * size * 4);
  const dark = hex("#5f8d4a"), light = hex("#8fb877");
  // Fast punktmönster: jitter i ett rutnät, så att det blir jämnt fördelat men inte rutigt.
  const cells = 6, step = size / cells;
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
    if (hash(cx, cy, 5) < 0.25) continue;
    const px = (cx + 0.2 + hash(cx, cy, 1) * 0.6) * step, py = (cy + 0.2 + hash(cx, cy, 2) * 0.6) * step;
    const rad = 3.2 + hash(cx, cy, 3) * 2.2;
    for (let y = Math.floor(py - rad - 1); y <= py + rad + 1; y++) for (let x = Math.floor(px - rad - 1); x <= px + rad + 1; x++) {
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d > rad + 0.8) continue;
      const xx = ((x % size) + size) % size, yy = ((y % size) + size) % size, i = (yy * size + xx) * 4;
      // Ljusare upptill till vänster (ljuset från nordväst), mjuk kant.
      const t = Math.max(0, Math.min(1, ((y + 0.5 - py) + (x + 0.5 - px)) / (rad * 2) + 0.5));
      const c = [0, 1, 2].map((k) => light[k] + (dark[k] - light[k]) * t);
      const a = Math.max(0, Math.min(1, rad + 0.8 - d)) * 200;
      if (a > data[i + 3]) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = a; }
    }
  }
  return { width: size, height: size, data };
}

function clamp(x: number): number { return Math.max(0, Math.min(255, Math.round(x))); }

/** Alla kartans texturer per bild-id i stilen. Skapas först när kartan ber om dem (`styleimagemissing`). */
export const MAP_TEXTURES: Record<string, () => Texture> = {
  paper: () => paperTexture(),
  "wash-light": () => washTexture("#ffffff", 0.7, 21),
  wood: () => paintedTexture("#9fc785", "#5f8f4a", "#c3dda6", 37),
  water: () => paintedTexture("#8fc1df", "#5f9cc8", "#c4e1f1", 53),
  trees: () => treeTexture(),
};
