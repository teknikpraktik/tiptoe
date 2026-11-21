#!/usr/bin/env python3
"""Skär ut sex utklipp ur ett bildark (3 kolumner × 2 rader) med genomskinlig bakgrund.

Kolumner: sida (vänster), trekvart, framifrån. Rader: stående (överst), liggande (nederst).
Användning: python3 -I scripts/import-sheet.py <ark.png|webp> <art> <utkatalog>
Skriver <utkatalog>/<art>/{side,quarter,front}-{stand,lie}.webp (beskurna tätt, höjd 600 px) och skriver bildförhållandena som JSON.
Kräver Pillow. Arket måste ha alfakanal (se --key-black för svart bakgrund).
"""
import json, sys
from PIL import Image

def gaps(profile, n_parts, lo, hi):
    """Index för de n_parts-1 tydligaste tomma raderna/kolumnerna, sökta inom [lo, hi) andelar av längden runt jämna delningspunkter."""
    L = len(profile); cuts = []
    for k in range(1, n_parts):
        c = int(L * k / n_parts); w = int(L * (hi - lo) / n_parts / 2)
        best = min(range(max(1, c - w), min(L - 1, c + w)), key=lambda i: (profile[i], abs(i - c)))
        cuts.append(best)
    return [0] + cuts + [L]

def key_black(im, lo=10, hi=40):
    """Svart bakgrund → genomskinlig: fyll från kanterna över nästan svarta pixlar, mjuk övergång (lo–hi i max(R,G,B))."""
    im = im.convert("RGBA"); w, h = im.size; px = im.load()
    seen = bytearray(w * h); stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]: continue
        r, g, b, a = px[x, y]
        m = max(r, g, b)
        if m >= hi: continue
        seen[i] = 1
        px[x, y] = (r, g, b, 0 if m <= lo else int(255 * (m - lo) / (hi - lo)))
        if m <= lo:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]: stack.append((nx, ny))
    return im

def main():
    src, species, out = sys.argv[1], sys.argv[2], sys.argv[3]
    im = Image.open(src)
    im = key_black(im) if "--key-black" in sys.argv else im.convert("RGBA")
    a = im.getchannel("A")
    w, h = im.size
    data = a.load()
    rowp = [sum(1 for x in range(0, w, 2) if data[x, y] > 32) for y in range(h)]
    rows = gaps(rowp, 2, 0.3, 0.7)
    names = ["side", "quarter", "front"]; poses = ["stand", "lie"]
    import os; os.makedirs(f"{out}/{species}", exist_ok=True)
    result = {}
    for ri in range(2):
        y0, y1 = rows[ri], rows[ri + 1]
        colp = [sum(1 for y in range(y0, y1, 2) if data[x, y] > 32) for x in range(w)]
        cols = gaps(colp, 3, 0.2, 0.8)
        for ci in range(3):
            cell = im.crop((cols[ci], y0, cols[ci + 1], y1))
            box = cell.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
            if not box: raise SystemExit(f"tom cell {ri},{ci}")
            sprite = cell.crop((max(0, box[0] - 2), max(0, box[1] - 2), min(cell.width, box[2] + 2), min(cell.height, box[3] + 1)))
            H = 600
            sprite = sprite.resize((round(sprite.width * H / sprite.height), H), Image.LANCZOS) if sprite.height > H else sprite
            path = f"{out}/{species}/{names[ci]}-{poses[ri]}.webp"
            sprite.save(path, "WEBP", quality=86, method=6)
            result[f"{names[ci]}-{poses[ri]}"] = {"src": "/" + path.split("public/", 1)[-1], "aspect": round(sprite.width / sprite.height, 3)}
    print(json.dumps(result))

main()
