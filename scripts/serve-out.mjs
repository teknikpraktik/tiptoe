// Minimal statisk server för `out/` (efter `npm run build`), för e2e och lokal provning. Ingen beroende utöver Node.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.env.OUT_DIR ?? "out");
const PORT = Number(process.env.PORT ?? 3100);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".txt": "text/plain", ".woff2": "font/woff2" };

async function resolveFile(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let f = path.join(ROOT, clean);
  if (!f.startsWith(ROOT)) return null;
  try { if ((await stat(f)).isDirectory()) f = path.join(f, "index.html"); await stat(f); return f; } catch { /* fall through */ }
  try { await stat(f + ".html"); return f + ".html"; } catch { return null; }
}

export function serve(port = PORT) {
  const server = createServer(async (req, res) => {
    const f = await resolveFile(req.url ?? "/");
    if (!f) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(f));
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) { await serve(); console.log(`serving ${ROOT} on http://localhost:${PORT}`); }
