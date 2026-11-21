"use client";

import { tryOpenDb, type Db } from "@/storage/idb";

/** En databasanslutning för hela appen (öppnas vid första behov). Null om IndexedDB saknas (t.ex. privat läge). */
let p: Promise<Db | null> | null = null;
/** Raderas eller uppgraderas databasen utifrån (rensad webbläsardata, en annan flik) laddas appen om och öppnar en ny anslutning. */
export const appDb = (): Promise<Db | null> => (p ??= tryOpenDb(undefined, undefined, () => { if (typeof location !== "undefined") location.reload(); }));
