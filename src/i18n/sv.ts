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

  "lang.sv": "Svenska",
  "lang.en": "English",
} as const;

export type MessageKey = keyof typeof sv;
