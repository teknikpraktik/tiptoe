"use client";

import { tryOpenDb, type Db } from "@/storage/idb";

/** En databasanslutning för hela appen (öppnas vid första behov). Null om IndexedDB saknas (t.ex. privat läge). */
let p: Promise<Db | null> | null = null;
export const appDb = (): Promise<Db | null> => (p ??= tryOpenDb());
