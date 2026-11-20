import type { Placement } from "./projection";

/**
 * Fotobetyg 1–3 stjärnor (spec: Fotobetyg): avstånd i förhållande till artens fotoavstånd, inramning (nära mitten och helt i bild) och djurets
 * tillstånd (lugnt, inte flyende). Ren funktion.
 */
export interface RatingInput {
  distM: number;
  photoM: number;
  placement: Placement;
  state: "calm" | "alert" | "flee";
}

export interface Rating {
  stars: 0 | 1 | 2 | 3;
  /** Delbetyg 0–1, för resultatskärmen och fältloggen. */
  distance: number;
  framing: number;
  calm: number;
}

export const RATING = { weights: { distance: 0.4, framing: 0.35, calm: 0.25 }, three: 0.85, two: 0.5 } as const;

export function ratePhoto(r: RatingInput): Rating {
  // Halva fotoavståndet eller närmare = fullt; vid fotoavståndet = 0.
  const distance = Math.max(0, Math.min(1, (1 - r.distM / r.photoM) / 0.5));
  const p = r.placement;
  let framing = 0;
  if (p.inFrame) {
    const cx = p.x - 0.5, cy = p.y - p.heightFrac / 2 - 0.5;
    const off = Math.hypot(cx, cy);
    framing = Math.max(0, 1 - off / 0.35);
    // Ett pyttelitet djur är inte en bra bild.
    if (p.heightFrac < 0.06) framing *= p.heightFrac / 0.06;
  }
  const calm = r.state === "calm" ? 1 : r.state === "alert" ? 0.5 : 0;
  if (!p.inFrame) return { stars: 0, distance, framing: 0, calm };
  const w = RATING.weights;
  const total = w.distance * distance + w.framing * framing + w.calm * calm;
  return { stars: total >= RATING.three ? 3 : total >= RATING.two ? 2 : 1, distance, framing, calm };
}
