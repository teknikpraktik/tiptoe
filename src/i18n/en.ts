import type { MessageKey } from "./sv";

/** English dictionary. Must have exactly the same keys as `sv.ts` (TypeScript and src/tests/unit/i18n.test.ts check it). */
export const en: Record<MessageKey, string> = {
  "app.name": "Tiptoe",
  "app.subtitle": "Wild Encounters",
  "app.tagline": "Get close before it flees.",

  "common.close": "Close",
  "common.back": "Back",
  "common.cancel": "Cancel",
  "common.ok": "OK",
  "common.update": "Update",
  "common.updateAvailable": "A new version of Tiptoe is available.",

  "home.startWalk": "Start walk",
  "home.fieldbook": "Field book",
  "home.settings": "Settings",
  "home.comingSoon": "Coming soon",

  "map.locating": "Finding your position …",
  "map.attribution": "Map data",
  "map.northUp": "North up",
  "map.trackUp": "Heading up",
  "map.follow": "Follow me",

  "gps.quality.ok": "GPS good",
  "gps.quality.fair": "GPS ok",
  "gps.quality.weak": "GPS weak",
  "gps.quality.poor": "GPS poor",
  "gps.quality.unavailable": "No GPS",
  "gps.accuracy": "±{m} m",
  "gps.error.denied": "Location access denied. Allow location for the app in your phone's settings and reload.",
  "gps.error.unavailable": "No location right now. Move to open sky.",
  "gps.error.timeout": "Getting a location is taking long. Move to open sky.",
  "gps.error.unsupported": "This browser does not support location.",

  "point.water": "The spot is in water.",
  "point.building": "The spot is inside a building.",
  "point.major_road": "The spot is on a major road.",
  "point.railway": "The spot is on a railway.",

  "lang.sv": "Svenska",
  "lang.en": "English",
};
