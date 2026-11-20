import type { Db } from "./idb";

/** Ett sparat foto (spec: lagret `photos` med bild-Blobs). Metadata (betyg, individ, plats) ligger i `observations` från steg 5. */
export interface StoredPhoto {
  id: string;
  createdAt: number;
  blob: Blob;
  width: number;
  height: number;
  /** Fri diagnostik (läge 2D/3D, zoom, avstånd) under spiken. */
  meta?: Record<string, unknown>;
}

export const photoId = (tMs: number, rnd = Math.random) => `p${tMs.toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`;

export async function savePhoto(db: Db, p: StoredPhoto): Promise<void> {
  await db.store<StoredPhoto>("photos").put(p.id, p);
}

export async function loadPhoto(db: Db, id: string): Promise<StoredPhoto | undefined> {
  return db.store<StoredPhoto>("photos").get(id);
}

export async function listPhotos(db: Db): Promise<StoredPhoto[]> {
  return (await db.store<StoredPhoto>("photos").all()).sort((a, b) => b.createdAt - a.createdAt);
}
