import { describe, expect, it } from "vitest";
import { AUDIO, SoundDirector, ambienceFor, panFor, type HeardAnimal } from "@/audio/director";
import { simPoint } from "@/sim/env";

const me = simPoint(0, 0);
const at = (x: number, y: number, id: string, species: HeardAnimal["species"] = "badger"): HeardAnimal => ({ id, species, pos: simPoint(x, y) });

describe("ljudregi", () => {
  it("panorering: djur till höger hörs till höger, rakt fram i mitten, okänd riktning i mitten", () => {
    expect(panFor(me, simPoint(100, 0), 0)).toBeCloseTo(1, 3);
    expect(panFor(me, simPoint(-100, 0), 0)).toBeCloseTo(-1, 3);
    expect(panFor(me, simPoint(0, 100), 0)).toBeCloseTo(0, 3);
    expect(panFor(me, simPoint(100, 0), 90)).toBeCloseTo(0, 3); // man tittar österut
    expect(panFor(me, simPoint(100, 0), null)).toBe(0);
  });
  it("ett djur hörs en gång när det kommer inom hörhåll, inte igen", () => {
    const d = new SoundDirector();
    expect(d.update({ tMs: 0, player: me, headingDeg: 0, animals: [at(0, 300, "a")], events: [] })).toEqual([]);
    const c = d.update({ tMs: 1000, player: me, headingDeg: 0, animals: [at(0, 150, "a")], events: [] });
    expect(c).toHaveLength(1);
    expect(d.update({ tMs: 20_000, player: me, headingDeg: 0, animals: [at(0, 120, "a")], events: [] })).toEqual([]);
  });
  it("nedkylning och gruppering: tre djur på en gång ger ett ljud nu och högst ett till efter nedkylningen", () => {
    const d = new SoundDirector();
    const animals = [at(0, 100, "a"), at(50, 100, "b"), at(-50, 100, "c")];
    let n = 0;
    for (let t = 0; t <= AUDIO.cooldownMs + 1000; t += 500) n += d.update({ tMs: t, player: me, headingDeg: 0, animals, events: [] }).length;
    expect(n).toBe(1);
  });
  it("frys-förvarning, flykt, dykning och inflyttning har egna ljud och spelas direkt", () => {
    const d = new SoundDirector();
    const animals = [at(0, 40, "o", "otter"), at(0, 60, "e", "white_tailed_eagle")];
    const c = d.update({ tMs: 0, player: me, headingDeg: 0, animals, events: [
      { type: "look_warn", id: "o", tMs: 0 },
      { type: "flee", id: "e", distM: 60, tempo: "walk", tMs: 0 },
      { type: "gone", id: "o", reason: "dove", tMs: 0 },
      { type: "appear", id: "m", species: "hare", distM: 40, habitat: "forest", tMs: 0, via: "moved_in" },
    ] });
    expect(c.map((x) => x.kind)).toEqual(expect.arrayContaining(["warn", "wings", "splash", "chime"]));
  });
  it("ambient efter miljön", () => {
    expect(ambienceFor("forest", 500)).toBe("forest");
    expect(ambienceFor("urban", 500)).toBe("urban");
    expect(ambienceFor("urban", 30)).toBe("water");
    expect(ambienceFor("field", 500)).toBe("open");
  });
});
