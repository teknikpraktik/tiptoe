import { wrap180 } from "@/sensors/heading";

/**
 * Var ett djur hamnar i kamerabilden (spik 1, 2D-utklipp). Ren geometri, testbar i Node.
 * Kameran beskrivs av synfältet i porträtt (horisontellt och vertikalt) och en digital zoom (teleobjektivet). Djuret står på marken på
 * avståndet `distM` i bäringen `bearingDeg`; dess fötter ligger `eyeHeightM` under ögonhöjd.
 */
export interface CameraModel {
  /** Horisontellt synfält i porträtt, grader (typiskt 45–55 för en bakre huvudkamera; kalibreras i fält). */
  hfovDeg: number;
  /** Vertikalt synfält i porträtt, grader. */
  vfovDeg: number;
}

export const DEFAULT_CAMERA: CameraModel = { hfovDeg: 50, vfovDeg: 66 };
export const EYE_HEIGHT_M = 1.4;

/** Teleobjektivets största zoom. Högre zoom ger få källpixlar i bakgrunden och gör djuret svårt att hålla i bild. */
export const MAX_TELE_ZOOM = 5;
/** Den andel av bildhöjden som teleobjektivet försöker fylla med djuret. */
export const TELE_FILL = 0.28;

/**
 * Teleobjektivets zoom ur avståndet och djurets storlek (spec: avståndet styr zoomen). Zoomen väljs så att djuret fyller ungefär
 * `TELE_FILL` av bildhöjden, mellan 1× och `MAX_TELE_ZOOM`. Små djur (ekorre, igelkott) får alltså mer zoom än en älg på samma avstånd;
 * på långt håll slår taket till och djuret blir mindre, så avståndet syns fortfarande i bilden.
 */
export function teleZoom(distM: number, heightM = 1, camera: CameraModel = DEFAULT_CAMERA): number {
  // Samma modell som placeAnimal: heightFrac = höjd / avstånd / (2·tan(vfov / 2z)).
  const halfDeg = Math.atan(Math.max(0.05, heightM) / (2 * TELE_FILL * Math.max(0.1, distM))) * (180 / Math.PI);
  const z = camera.vfovDeg / (2 * halfDeg);
  return Math.max(1, Math.min(MAX_TELE_ZOOM, z));
}

/**
 * Bildkvalitet 0–1 ur avståndet relativt artens fotoavstånd: 1 på halva fotoavståndet eller närmare, 0 vid fotoavståndet.
 * Styr oskärpa och kornighet (spec: avståndet styr bildens kvalitet).
 */
export function distanceQuality(distM: number, photoDistM: number): number {
  const q = (photoDistM - distM) / (photoDistM * 0.5);
  return Math.max(0, Math.min(1, q));
}

export interface Placement {
  /** Fötternas mittpunkt i bilden, 0–1 (x från vänster, y uppifrån). Kan ligga utanför 0–1 (djuret är utanför bild). */
  x: number;
  y: number;
  /** Djurets höjd som andel av bildens höjd. */
  heightFrac: number;
  /** Djurets vinkel från bildens mitt, grader (negativ = till vänster). */
  offAxisDeg: number;
  /** Hela djuret syns i bild. */
  inFrame: boolean;
}

/**
 * Placering av ett djur med höjden `animalHeightM` i bilden. `verticalNudge` (andel av bildhöjden) är spelarens egen justering av djurets
 * höjd i bilden (spec: spelaren kan justera djurets vertikala position).
 */
export function placeAnimal(o: {
  bearingDeg: number; distM: number; cameraYawDeg: number; cameraPitchDeg: number; animalHeightM: number; zoom: number;
  camera?: CameraModel; verticalNudge?: number; eyeHeightM?: number;
}): Placement {
  const cam = o.camera ?? DEFAULT_CAMERA;
  const eye = o.eyeHeightM ?? EYE_HEIGHT_M;
  const h = cam.hfovDeg / o.zoom, v = cam.vfovDeg / o.zoom;
  const off = wrap180(o.bearingDeg - o.cameraYawDeg);
  // Perspektiv: tan-projektion, så att bildens kanter motsvarar halva synfältet.
  const tanH = Math.tan((h / 2) * (Math.PI / 180)), tanV = Math.tan((v / 2) * (Math.PI / 180));
  const offRad = (off * Math.PI) / 180;
  const x = Math.abs(off) >= 89 ? (off < 0 ? -10 : 10) : 0.5 + Math.tan(offRad) / (2 * tanH);
  // Siktstöd i tele: fötternas vinkel under horisonten dämpas med zoomen, annars hamnar ett nära djur under bildkanten när telefonen hålls
  // vågrätt (8° nedåt på 10 m, men bara ±5° synfält vid 6×). Telefonens egen lutning verkar fullt ut. Vid 1× är bilden geometriskt riktig.
  const footElev = (-Math.atan2(eye, o.distM) * (180 / Math.PI)) / o.zoom;
  const rel = ((footElev - o.cameraPitchDeg) * Math.PI) / 180;
  const y = 0.5 - Math.tan(rel) / (2 * tanV) + (o.verticalNudge ?? 0);
  const heightFrac = o.animalHeightM / o.distM / (2 * tanV);
  const halfW = heightFrac * 0.75; // utklippen är ungefär 1,5 gånger så breda som höga
  const inFrame = x - halfW >= 0 && x + halfW <= 1 && y - heightFrac >= 0 && y <= 1;
  return { x, y, heightFrac, offAxisDeg: off, inFrame };
}

/** Vilken vinkel av utklippet som ska visas, ur djurets kurs relativt spelaren (spec: minst framifrån, sidan, bakifrån). */
export type View = "front" | "quarter_left" | "quarter_right" | "left" | "right" | "back";
export function viewFor(animalHeadingDeg: number, bearingFromPlayerDeg: number): View {
  // Vinkeln mellan djurets kurs och riktningen från spelaren till djuret: 0 = går bort från spelaren (bakifrån), 180 = mot (framifrån).
  const d = wrap180(animalHeadingDeg - bearingFromPlayerDeg);
  if (Math.abs(d) <= 45) return "back";
  if (Math.abs(d) >= 155) return "front";
  if (Math.abs(d) >= 115) return d > 0 ? "quarter_right" : "quarter_left";
  return d > 0 ? "right" : "left";
}

/** Bilderna visar djuret åt vänster; åt höger speglas de. */
export const mirrored = (v: View) => v === "right" || v === "quarter_right";
