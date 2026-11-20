/**
 * Sammanslagning av kamerabild och djur till ett foto (spec: Kamera och fotografering → Flöde, steg 5, och Look och realism).
 * - Videon beskärs till skärmens bildförhållande och teleobjektivets zoom, så att fotot blir exakt det spelaren såg.
 * - Djuret ritas med kontaktskugga, och avståndsoskärpa görs genom ned- och uppskalning (fungerar i alla webbläsare; `ctx.filter` saknas
 *   i äldre Safari).
 * - En gemensam färgsättning läggs över både kamera och djur, sedan kornighet och vinjett: det döljer att bilden är sammanfogad.
 * Geometrin är ren och testas i Node; ritningen tar en 2D-kontext.
 */
export interface Rect { x: number; y: number; w: number; h: number }

/** Den del av videon som syns: mitten, med skärmens bildförhållande (som `object-fit: cover`), delad med zoomen. */
export function visibleCrop(videoW: number, videoH: number, viewAspect: number, zoom: number): Rect {
  let w = videoW, h = videoW / viewAspect;
  if (h > videoH) { h = videoH; w = videoH * viewAspect; }
  w /= zoom; h /= zoom;
  return { x: (videoW - w) / 2, y: (videoH - h) / 2, w, h };
}

/** Fotots storlek: beskärningen, men högst `maxLong` px på långsidan (mål 300–600 kB som JPEG). Aldrig uppskalat över 1600 px. */
export function outputSize(crop: Rect, maxLong = 1600): { w: number; h: number } {
  const long = Math.max(crop.w, crop.h);
  const k = Math.min(1, maxLong / long);
  // Kraftig digital zoom ger få källpixlar: skala ändå upp till minst 1080 px på långsidan så att fotot inte blir pyttelitet.
  const k2 = long * k < 1080 ? 1080 / long : k;
  return { w: Math.round(crop.w * k2), h: Math.round(crop.h * k2) };
}

/** Djurets rektangel i fotot ur placeringen (fötternas mittpunkt och höjd som andelar). */
export function animalRect(outW: number, outH: number, x: number, y: number, heightFrac: number, imgAspect: number): Rect {
  const h = heightFrac * outH, w = h * imgAspect;
  return { x: x * outW - w / 2, y: y * outH - h, w, h };
}

export interface Grade {
  /** Varm/kall ton över hela bilden (CSS-färg) och dess styrka 0–1. */
  tint: string;
  tintAlpha: number;
  /** Vinjett 0–1. */
  vignette: number;
  /** Kornighet 0–1. */
  grain: number;
}

export const FILM_GRADE: Grade = { tint: "#e8b878", tintAlpha: 0.14, vignette: 0.55, grain: 0.22 };

/** Kornighet och oskärpa ur bildkvaliteten (0–1, se `distanceQuality`): längre bort ger mjukare djur och mer korn. */
export function lookFor(quality: number): { blurPx: number; grain: number } {
  const q = Math.max(0, Math.min(1, quality));
  return { blurPx: (1 - q) * 3, grain: FILM_GRADE.grain + (1 - q) * 0.15 };
}

type Ctx = CanvasRenderingContext2D;
type Src = CanvasImageSource;

export interface CompositeInput {
  video: Src;
  videoW: number;
  videoH: number;
  /** Skärmens (kameravyns) bredd/höjd. */
  viewAspect: number;
  zoom: number;
  /** Djurets bild, eller null (då bara kamerabilden). */
  animal: null | { img: Src; imgAspect: number; x: number; y: number; heightFrac: number; mirror?: boolean; blurPx: number; shadow: boolean };
  grade?: Grade;
  grain?: number;
  /** Skapar en hjälp-canvas (för oskärpa och korn). I webbläsaren: document.createElement("canvas"). */
  makeCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas;
  /** Slumptal för kornet (seedat i test). */
  random?: () => number;
}

/** Ritar fotot på `ctx` (vars canvas redan har storleken ur `outputSize`). */
export function drawComposite(ctx: Ctx, outW: number, outH: number, o: CompositeInput): void {
  const g = o.grade ?? FILM_GRADE;
  const crop = visibleCrop(o.videoW, o.videoH, o.viewAspect, o.zoom);
  ctx.drawImage(o.video, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
  const a = o.animal;
  if (a) {
    const r = animalRect(outW, outH, a.x, a.y, a.heightFrac, a.imgAspect);
    if (a.shadow) {
      // Kontaktskugga: en mjuk mörk ellips under fötterna.
      const cx = r.x + r.w / 2, cy = r.y + r.h, rx = r.w * 0.42, ry = Math.max(2, r.h * 0.06);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0, "rgba(10,8,5,0.55)");
      grad.addColorStop(1, "rgba(10,8,5,0)");
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    let src: Src = a.img;
    if (a.blurPx > 0.3) {
      // Oskärpa: rita i lägre upplösning och skala upp (bilinjär interpolation).
      const k = 1 / (1 + a.blurPx);
      const tmp = o.makeCanvas(Math.max(1, Math.round(r.w * k)), Math.max(1, Math.round(r.h * k)));
      const tc = tmp.getContext("2d") as Ctx;
      tc.imageSmoothingQuality = "high";
      tc.drawImage(a.img, 0, 0, tmp.width, tmp.height);
      src = tmp as unknown as Src;
    }
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    if (a.mirror) { ctx.translate(r.x + r.w, r.y); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, r.w, r.h); }
    else ctx.drawImage(src, r.x, r.y, r.w, r.h);
    ctx.restore();
  }
  // Gemensam färgsättning över allt (kamera + djur).
  ctx.save();
  ctx.globalAlpha = g.tintAlpha;
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = g.tint;
  ctx.fillRect(0, 0, outW, outH);
  ctx.restore();
  // Kornighet: ett litet brusmönster upprepat över bilden.
  const grain = o.grain ?? g.grain;
  if (grain > 0) {
    const n = o.makeCanvas(128, 128);
    const nc = n.getContext("2d") as Ctx;
    const img = nc.createImageData(128, 128);
    const rnd = o.random ?? Math.random;
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    nc.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = grain * 0.35;
    ctx.globalCompositeOperation = "overlay";
    const pat = ctx.createPattern(n as unknown as CanvasImageSource, "repeat");
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, outW, outH); }
    ctx.restore();
  }
  // Vinjett.
  if (g.vignette > 0) {
    const r0 = Math.min(outW, outH) * 0.35, r1 = Math.hypot(outW, outH) * 0.6;
    const v = ctx.createRadialGradient(outW / 2, outH / 2, r0, outW / 2, outH / 2, r1);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${g.vignette})`);
    ctx.save();
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }
}
