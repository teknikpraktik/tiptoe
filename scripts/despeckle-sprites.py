#!/usr/bin/env python3
# Användning: python3 -I scripts/despeckle-sprites.py public/animals/<art>/*.webp (kör efter import-sheet.py; uppdatera sedan aspect i manifestet).
# Tar bort lösa bitar (andra figurers hornspetsar o.d.) som inte hänger ihop med djuret och beskär om. Skriver bara om filer som ändras.
import sys
from collections import deque
from PIL import Image
for path in sys.argv[1:]:
    im = Image.open(path).convert("RGBA"); w, h = im.size
    a = im.getchannel("A"); px = a.load()
    mask = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            if px[x, y] > 8: mask[y * w + x] = 1
    label = [0] * (w * h); sizes = [0]; cur = 0
    for i in range(w * h):
        if mask[i] and not label[i]:
            cur += 1; sizes.append(0); q = deque([i]); label[i] = cur
            while q:
                j = q.popleft(); sizes[cur] += 1; x, y = j % w, j // w
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            k = ny * w + nx
                            if mask[k] and not label[k]: label[k] = cur; q.append(k)
    if cur <= 1: continue
    big = max(sizes)
    drop = {c for c in range(1, cur + 1) if sizes[c] < big * 0.03}
    if not drop: continue
    out = im.load()
    for i in range(w * h):
        if label[i] in drop: x, y = i % w, i // w; r, g, b, _ = out[x, y]; out[x, y] = (r, g, b, 0)
    box = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    im = im.crop((max(0, box[0] - 2), max(0, box[1] - 2), min(w, box[2] + 2), min(h, box[3] + 1)))
    im.save(path, "WEBP", quality=86, method=4)
    print(path.split("/animals/")[1], f"{len(drop)} bitar bort", f"{w}x{h} -> {im.width}x{im.height}")
