// Platshållarutklipp per art (3 vinklar × 2 poser), tydligt märkta. Ersätts av riktiga bilder genom att byta filer och public/animals/manifest.json.
// Kör: node scripts/make-placeholders.mjs (kräver Chromium för att rendera SVG till PNG med transparent bakgrund).
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

// Form per art: kroppens längd/höjd, benlängd, halslängd, huvud, öron, svans, färger och särdrag. Enheter i en 600 × 400-ruta.
const S = {
  squirrel: { c: "#a5532a", d: "#6e3417", l: "#e7c9a0", body: [150, 70], leg: 50, neck: 20, head: 40, ear: 22, tail: "bushy" },
  hare: { c: "#8a7a62", d: "#5e5040", l: "#e6ddcc", body: [190, 90], leg: 70, neck: 20, head: 50, ear: 70, tail: "puff" },
  roe_deer: { c: "#8a5a36", d: "#5e3b22", l: "#efe4d2", body: [300, 125], leg: 140, neck: 80, head: 70, ear: 35, tail: "rump" },
  red_fox: { c: "#c0652a", d: "#3a2416", l: "#f3e6d4", body: [260, 90], leg: 90, neck: 40, head: 70, ear: 30, tail: "long" },
  hedgehog: { c: "#6e5a44", d: "#3d3024", l: "#c9b08d", body: [170, 90], leg: 25, neck: 0, head: 45, ear: 8, tail: "none", spines: true },
  badger: { c: "#77736c", d: "#1c1b19", l: "#f0efea", body: [260, 100], leg: 50, neck: 10, head: 70, ear: 14, tail: "short", stripe: true },
  beaver: { c: "#6b4a2e", d: "#3b2817", l: "#a48868", body: [240, 110], leg: 35, neck: 10, head: 70, ear: 10, tail: "flat" },
  wild_boar: { c: "#4a3d33", d: "#2a221c", l: "#7a6a5c", body: [300, 140], leg: 80, neck: 10, head: 100, ear: 25, tail: "short", tusk: true },
  moose: { c: "#4b3a2c", d: "#2a2018", l: "#bfb4a3", body: [340, 160], leg: 190, neck: 60, head: 100, ear: 35, tail: "short", antler: true },
  capercaillie: { bird: true, c: "#2e3330", d: "#141716", l: "#5e6f3a", body: [220, 140], leg: 40, head: 45, tail: "fan" },
  otter: { c: "#5a4330", d: "#3a2a1e", l: "#c9b391", body: [300, 70], leg: 30, neck: 20, head: 50, ear: 8, tail: "taper" },
  lynx: { c: "#b08a5e", d: "#4a3826", l: "#efe2cb", body: [260, 110], leg: 120, neck: 30, head: 70, ear: 35, tail: "stub", tufts: true, spots: true },
  wolf: { c: "#8a857c", d: "#4a4640", l: "#e3ded4", body: [300, 120], leg: 130, neck: 50, head: 80, ear: 32, tail: "long" },
  brown_bear: { c: "#5b3d22", d: "#3a2614", l: "#8a6a4a", body: [340, 190], leg: 110, neck: 20, head: 100, ear: 22, tail: "none" },
  white_tailed_eagle: { bird: true, eagle: true, c: "#5b4632", d: "#33271c", l: "#f2efe6", body: [170, 210], leg: 30, head: 55, tail: "white" },
};

/** Märkningen läggs i nederkant över djuret (efter beskärningen), så att den aldrig påverkar bildens mått. */
const LABEL = `<text id="lbl" font-family="sans-serif" font-size="13" fill="#ffffff" opacity=".7">PLATSHÅLLARE</text>`;
const e = (cx, cy, rx, ry, f, extra = "") => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}" ${extra}/>`;
const rect = (x, y, w, h, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2.5}" fill="${f}"/>`;

function quadSide(s, alert) {
  const [bw, bh] = s.body, ground = 392, legH = s.leg;
  const by = ground - legH - bh / 2 + 10, bx = 330;
  let out = "";
  // Ben
  for (const [i, dx] of [[0, -bw * 0.38], [1, -bw * 0.3], [2, bw * 0.28], [3, bw * 0.36]]) out += rect(bx + dx - 8, by + bh * 0.25, 16, ground - by - bh * 0.25, i % 2 ? s.d : s.c);
  // Svans (bakom, höger)
  const tx = bx + bw / 2, ty = by - bh * 0.1;
  if (s.tail === "bushy") out += e(tx + 30, ty - 40, 35, 70, s.c, `transform="rotate(20 ${tx + 30} ${ty - 40})"`);
  if (s.tail === "long") out += e(tx + 60, ty + 30, 75, 20, s.c, `transform="rotate(25 ${tx + 60} ${ty + 30})"`) + e(tx + 120, ty + 60, 18, 12, "#fff");
  if (s.tail === "flat") out += e(tx + 50, ground - 15, 60, 14, s.d);
  if (s.tail === "taper") out += e(tx + 60, ty + 20, 80, 12, s.c, `transform="rotate(15 ${tx + 60} ${ty + 20})"`);
  if (s.tail === "short" || s.tail === "stub" || s.tail === "puff") out += e(tx + 6, ty, 14, 12, s.tail === "puff" ? "#fff" : s.d);
  // Kropp
  out += e(bx, by, bw / 2, bh / 2, s.c) + e(bx, by + bh * 0.22, bw * 0.4, bh * 0.2, s.l, 'opacity=".45"');
  if (s.tail === "rump") out += e(tx - 10, by - bh * 0.1, 24, 32, s.l);
  if (s.spines) for (let k = -6; k <= 6; k++) out += `<line x1="${bx + k * 12}" y1="${by - bh * 0.3}" x2="${bx + k * 14}" y2="${by - bh * 0.75}" stroke="${s.d}" stroke-width="5"/>`;
  if (s.stripe) out += e(bx, by - bh * 0.15, bw * 0.45, bh * 0.15, "#d9d6cf", 'opacity=".5"');
  if (s.spots) for (let k = 0; k < 9; k++) out += e(bx - bw * 0.3 + (k % 5) * bw * 0.15, by - 10 + Math.floor(k / 5) * 25, 6, 5, s.d, 'opacity=".6"');
  // Hals och huvud (vänster). Vaksam: huvudet högt; lugn: lågt (betar).
  const hx = bx - bw / 2 - s.head * 0.2, hy = alert ? by - bh / 2 - s.neck - s.head * 0.2 : by + bh * 0.1 + s.neck * 0.6;
  if (s.neck > 0) out += `<path d="M${bx - bw * 0.35} ${by - bh * 0.2} L${hx + s.head * 0.35} ${hy - s.head * 0.2} L${hx + s.head * 0.45} ${hy + s.head * 0.3} L${bx - bw * 0.25} ${by + bh * 0.25} Z" fill="${s.c}"/>`;
  out += e(hx, hy, s.head * 0.62, s.head * 0.4, s.c) + e(hx - s.head * 0.55, hy + s.head * 0.08, s.head * 0.22, s.head * 0.18, s.d);
  out += `<circle cx="${hx - s.head * 0.15}" cy="${hy - s.head * 0.1}" r="4" fill="#120c08"/>`;
  out += e(hx + s.head * 0.25, hy - s.head * 0.35 - s.ear * 0.5, s.ear * 0.3, s.ear * 0.6, s.d);
  if (s.tufts) out += `<line x1="${hx + s.head * 0.25}" y1="${hy - s.head * 0.35 - s.ear}" x2="${hx + s.head * 0.25}" y2="${hy - s.head * 0.35 - s.ear - 14}" stroke="#111" stroke-width="3"/>`;
  if (s.tusk) out += `<path d="M${hx - s.head * 0.6} ${hy + s.head * 0.1} q -6 -18 6 -22" stroke="#efe8d8" stroke-width="5" fill="none"/>`;
  if (s.antler) out += `<path d="M${hx + s.head * 0.2} ${hy - s.head * 0.3} q 20 -50 80 -40 m -80 40 q -10 -40 -60 -50" stroke="#c8b998" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  return out;
}
function quadFront(s, alert) {
  const [bw, bh] = s.body, ground = 392, w = Math.max(90, bh * 1.1), cx = 300;
  const by = ground - s.leg - bh / 2 + 10;
  let out = rect(cx - w * 0.3 - 9, by, 18, ground - by, s.d) + rect(cx + w * 0.3 - 9, by, 18, ground - by, s.d);
  out += e(cx, by, w / 2, bh / 2, s.c) + e(cx, by + bh * 0.1, w * 0.25, bh * 0.3, s.l, 'opacity=".5"');
  const hy = alert ? by - bh / 2 - s.neck * 0.8 : by + bh * 0.05;
  if (s.neck > 0) out += rect(cx - s.head * 0.2, hy, s.head * 0.4, by - hy, s.c);
  out += e(cx, hy, s.head * 0.45, s.head * 0.5, s.c) + e(cx, hy + s.head * 0.35, s.head * 0.22, s.head * 0.16, s.d);
  out += `<circle cx="${cx - s.head * 0.18}" cy="${hy - s.head * 0.05}" r="4" fill="#120c08"/><circle cx="${cx + s.head * 0.18}" cy="${hy - s.head * 0.05}" r="4" fill="#120c08"/>`;
  for (const sg of [-1, 1]) out += e(cx + sg * s.head * 0.45, hy - s.head * 0.45, s.ear * 0.3 + 4, s.ear * 0.6 + 4, s.c, `transform="rotate(${sg * 30} ${cx + sg * s.head * 0.45} ${hy - s.head * 0.45})"`);
  if (s.antler) for (const sg of [-1, 1]) out += `<path d="M${cx + sg * 20} ${hy - s.head * 0.4} q ${sg * 40} -50 ${sg * 110} -40" stroke="#c8b998" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  if (s.stripe) out += rect(cx - 8, hy - s.head * 0.5, 16, s.head * 0.9, "#f0efea");
  return out;
}
function quadBack(s, alert) {
  const [, bh] = s.body, ground = 392, w = Math.max(90, bh * 1.1), cx = 300;
  const by = ground - s.leg - bh / 2 + 10;
  let out = rect(cx - w * 0.3 - 9, by, 18, ground - by, s.d) + rect(cx + w * 0.3 - 9, by, 18, ground - by, s.d);
  const hy = alert ? by - bh / 2 - s.neck * 0.8 : by - bh * 0.2;
  out += e(cx, hy, s.head * 0.4, s.head * 0.45, s.d);
  for (const sg of [-1, 1]) out += e(cx + sg * s.head * 0.4, hy - s.head * 0.4, s.ear * 0.3 + 4, s.ear * 0.6 + 4, s.d);
  if (s.antler) for (const sg of [-1, 1]) out += `<path d="M${cx + sg * 20} ${hy - s.head * 0.3} q ${sg * 40} -50 ${sg * 110} -40" stroke="#c8b998" stroke-width="12" fill="none" stroke-linecap="round"/>`;
  out += e(cx, by, w / 2, bh / 2, s.c);
  if (s.tail === "rump" || s.tail === "puff") out += e(cx, by, w * 0.3, bh * 0.3, s.l);
  else if (s.tail !== "none") out += e(cx, by + bh * 0.2, 12, 30, s.d);
  return out;
}
function bird(s, view, alert) {
  const ground = 392, cx = 300, [bw, bh] = s.body;
  const by = ground - s.leg - bh / 2;
  let out = rect(cx - 25, by + bh * 0.3, 10, ground - by - bh * 0.3, "#c9a43a") + rect(cx + 15, by + bh * 0.3, 10, ground - by - bh * 0.3, "#c9a43a");
  if (s.eagle && view !== "front") out += `<path d="M${cx - 30} ${by + bh * 0.3} L${cx + 30} ${by + bh * 0.3} L${cx + 20} ${by + bh * 0.62} L${cx - 20} ${by + bh * 0.62} Z" fill="#f4f1ea"/>`;
  if (s.tail === "fan" && view !== "front") out += `<path d="M${cx} ${by + 20} L${cx - 90} ${by - 80} Q ${cx} ${by - 120} ${cx + 90} ${by - 80} Z" fill="${s.d}"/>`;
  out += e(cx, by, (view === "side" ? bw : bw * 0.75) / 2, bh / 2, s.c);
  if (view !== "back") out += e(cx, by + bh * 0.1, bw * 0.25, bh * 0.3, s.l, 'opacity=".55"');
  const hx = view === "side" ? cx - bw * 0.25 : cx, hy = by - bh / 2 - (alert ? s.head * 0.6 : s.head * 0.2);
  out += e(hx, hy, s.head * 0.45, s.head * 0.5, s.eagle ? "#d9cdb4" : s.d);
  if (view !== "back") out += `<path d="M${hx - (view === "side" ? s.head * 0.4 : 6)} ${hy} l ${view === "side" ? -22 : 6} 10 l ${view === "side" ? 22 : 6} 6 z" fill="#e2b83a"/><circle cx="${hx - 6}" cy="${hy - 6}" r="4" fill="#120c08"/>`;
  return out;
}

const svg = (id, view, pose) => {
  const s = S[id], alert = pose === "alert";
  const body = s.bird ? bird(s, view, alert) : view === "side" ? quadSide(s, alert) : view === "front" ? quadFront(s, alert) : quadBack(s, alert);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="-200 -400 1000 800"><g id="a">${body}</g>${LABEL}</svg>`;
};

mkdirSync("public/animals/placeholder", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
const manifest = { version: 1, note: "Platshållare (egen grafik, fri att använda). Byt fil och post per art när riktiga bilder med licens finns.", species: {} };
for (const id of Object.keys(S)) {
  const views = {};
  for (const view of ["side", "front", "back"]) {
    views[view] = {};
    for (const pose of ["calm", "alert"]) {
      const file = `/animals/placeholder/${id}-${view}-${pose}.png`;
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg(id, view, pose)}</body></html>`);
      // Tät beskärning: bildens underkant = fötterna, överkant = djurets högsta punkt. Höjden 400 px, bredden efter djuret.
      const aspect = await page.evaluate(() => {
        const svgEl = document.querySelector("svg"), b = document.getElementById("a").getBBox();
        const pad = 2, w = b.width + pad * 2, h = b.height + pad;
        svgEl.setAttribute("viewBox", `${b.x - pad} ${b.y - pad} ${w} ${h}`);
        svgEl.setAttribute("height", "400");
        svgEl.setAttribute("width", String(Math.round((400 * w) / h)));
        const l = document.getElementById("lbl");
        l.setAttribute("x", String(b.x + 4)); l.setAttribute("y", String(b.y + b.height - 6)); l.setAttribute("font-size", String(Math.max(10, h / 30)));
        return w / h;
      });
      await page.setViewportSize({ width: Math.round(400 * aspect) + 2, height: 402 });
      await page.locator("svg").screenshot({ path: `public${file}`, omitBackground: true });
      views[view][pose] = { src: file, aspect: Math.round(aspect * 1000) / 1000 };
    }
  }
  manifest.species[id] = { views, license: "placeholder (egen, fri)", placeholder: true };
}
writeFileSync("public/animals/manifest.json", JSON.stringify(manifest, null, 1) + "\n");
await browser.close();
console.log("placeholders:", Object.keys(S).length * 6);
