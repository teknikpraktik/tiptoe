import type { LatLon } from "./geometry";

/**
 * Höglänt terräng (för renen). Vektortilesen har ingen höjddata, så det är en grov region: fjällkedjan och de högre delarna av norra
 * Dalarna och Värmland (Branäs, Sälen, Idre), Härjedalen, Jämtlandsfjällen och Lappland. Tolkningen är generös; polygonens östra kant går
 * ungefär där fjällnära skog övergår i lägre land. Den västra kanten följer inte riksgränsen utan tar med de närmaste norska fjällen.
 * Punkterna är [lat, lon].
 */
export const UPLAND: [number, number][] = [
  [60.35, 11.6], [60.35, 13.3], [60.9, 13.9], [61.5, 14.1], [62.2, 14.3], [62.7, 14.4], [63.3, 14.2], [64.0, 15.1],
  [65.0, 16.4], [66.0, 18.0], [67.0, 21.0], [68.0, 22.0], [69.1, 23.0], [69.1, 17.5], [67.5, 14.5], [65.5, 12.6],
  [64.0, 12.0], [62.5, 11.4], [61.0, 11.3],
];

export function isUpland(p: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = UPLAND.length - 1; i < UPLAND.length; j = i++) {
    const [aLat, aLon] = UPLAND[i], [bLat, bLon] = UPLAND[j];
    if ((aLat > p.lat) !== (bLat > p.lat) && p.lon < ((bLon - aLon) * (p.lat - aLat)) / (bLat - aLat) + aLon) inside = !inside;
  }
  return inside;
}
