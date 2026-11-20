/**
 * Svenska ordlistan: standardspråk och källan till alla nycklar. En ny text läggs till här först; TypeScript kräver sedan att den
 * finns i `en.ts`. Platshållare skrivs `{namn}`.
 */
export const sv = {
  "app.name": "Tiptoe",
  "app.subtitle": "Wild Encounters",
  "app.tagline": "Smyg dig nära innan det flyr.",

  "common.close": "Stäng",
  "common.back": "Tillbaka",
  "common.cancel": "Avbryt",
  "common.ok": "OK",
  "common.update": "Uppdatera",
  "common.updateAvailable": "En ny version av Tiptoe finns.",

  "home.startWalk": "Starta promenad",
  "home.fieldbook": "Fältdagbok",
  "home.settings": "Inställningar",
  "home.comingSoon": "Kommer snart",

  "map.locating": "Söker position …",
  "map.attribution": "Kartdata",
  "map.northUp": "Norr upp",
  "map.trackUp": "Färdriktning upp",
  "map.follow": "Följ mig",

  "gps.quality.ok": "GPS bra",
  "gps.quality.fair": "GPS ok",
  "gps.quality.weak": "GPS svag",
  "gps.quality.poor": "GPS dålig",
  "gps.quality.unavailable": "Ingen GPS",
  "gps.accuracy": "±{m} m",
  "gps.error.denied": "Platsåtkomst nekad. Tillåt plats för appen i telefonens inställningar och ladda om.",
  "gps.error.unavailable": "Ingen position just nu. Gå ut under öppen himmel.",
  "gps.error.timeout": "Det tar lång tid att hitta positionen. Gå ut under öppen himmel.",
  "gps.error.unsupported": "Den här webbläsaren stöder inte plats.",

  "point.water": "Platsen ligger i vatten.",
  "point.building": "Platsen ligger inne i en byggnad.",
  "point.major_road": "Platsen ligger på en större väg.",
  "point.railway": "Platsen ligger på en järnväg.",

  "camera.open": "Öppna kameran",
  "camera.shutter": "Ta foto",
  "camera.close": "Stäng kameran",
  "camera.standStill": "Stå still för att fotografera",
  "camera.outOfFrame": "Djuret är utanför bild – vrid telefonen",
  "camera.searching": "Riktar in …",
  "camera.noCompass": "Ingen kompass – djuret förankras där kameran pekar",
  "camera.zoom": "{z}× tele",
  "camera.height": "Djurets höjd i bilden",
  "camera.error.denied": "Kameran är nekad. Tillåt kameran för appen i telefonens inställningar.",
  "camera.error.notfound": "Hittar ingen bakre kamera.",
  "camera.error.unsupported": "Den här webbläsaren kan inte använda kameran.",
  "camera.error.insecure": "Kameran kräver en säker anslutning (https).",
  "camera.error.other": "Kameran kunde inte startas.",
  "camera.orientationDenied": "Rörelsesensorerna är nekade. Djuret ligger still i bilden i stället för att följa telefonen.",
  "camera.saved": "Fotot är sparat i appen.",
  "camera.share": "Spara till Bilder / dela",
  "camera.again": "Ta ett till",
  "camera.photoTitle": "Tiptoe-foto",

  "spike.title": "Kameratest (spik 1)",
  "spike.intro": "Ett platshållarrådjur placeras framför dig. Vrid telefonen, ta foto och spara till Bilder. Jämför 2D och 3D.",
  "spike.mode2d": "2D-utklipp",
  "spike.mode3d": "3D-modell",
  "spike.distance": "Avstånd: {m} m",
  "spike.pose": "Pose",
  "spike.poseCalm": "Lugn",
  "spike.poseAlert": "Vaksam",
  "spike.view": "Djurets kurs: {deg}°",
  "spike.photos": "Sparade foton: {n}",
  "spike.metrics": "Mätvärden",
  "spike.copyReport": "Kopiera mätvärden",
  "spike.copied": "Kopierat",
  "home.tests": "Test (fas 1)",

  "lang.sv": "Svenska",
  "lang.en": "English",
} as const;

export type MessageKey = keyof typeof sv;
