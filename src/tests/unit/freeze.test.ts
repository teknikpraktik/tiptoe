import { describe, expect, it } from "vitest";
import { BEHAVIOR } from "@/engine/config";
import { newEngineState, WorldEngine, type EngineEvent } from "@/engine/engine";
import { cellOf, windowOf } from "@/engine/world";
import { haversineM } from "@/geo/geometry";
import type { Tempo } from "@/engine/species";
import { simEnvironment, simPoint } from "@/sim/env";

const env = simEnvironment();
const T0 = Date.UTC(2026, 10, 21, 10, 0, 0);

/** Ett rådjur och en spelare 50 m bort (inom medvetenhetsradien, utanför upptäcktsradien i stillhet/smyg). */
function setup() {
  const s = newEngineState(T0);
  const e = new WorldEngine(s, env);
  const deer = simPoint(500, -500);
  s.active.push({ id: "d", species: "roe_deer", seed: 3, cell: cellOf(deer), window: windowOf(T0), n: 0, home: deer, pos: deer, headingDeg: 0, state: "graze", alarm: 0, disturbed: true, appearedAtMs: T0 });
  s.budget = -100;
  return { s, e, me: simPoint(500, -550) };
}
/** Kör tills djuret tittar (blicken, efter förvarningen) medan spelaren står still. */
function untilLook(x: ReturnType<typeof setup>, ev: EngineEvent[]) {
  let t = T0;
  for (let i = 0; i < 120 && !ev.some((e) => e.type === "look"); i++) { t += 500; ev.push(...x.e.step({ tMs: t, pos: x.me, tempo: "still", posOk: true, tempoFromMotion: true })); }
  return t;
}

describe("frys-moment (spec: Frys!)", () => {
  it("djuret förvarnar (2 s) innan det tittar", () => {
    const x = setup();
    const ev: EngineEvent[] = [];
    untilLook(x, ev);
    const warn = ev.find((e) => e.type === "look_warn")!, look = ev.find((e) => e.type === "look")!;
    expect(warn).toBeDefined();
    expect(look.tMs - warn.tMs).toBeGreaterThanOrEqual(BEHAVIOR.freeze.warnMs);
    expect(x.s.active[0].state).toBe("look");
  });
  for (const [tempo, flees] of [["still", false], ["sneak", true], ["walk", true]] as [Tempo, boolean][]) {
    it(`under blicken: ${tempo} ⇒ ${flees ? "flyr" : "stannar"}`, () => {
      const x = setup();
      const ev: EngineEvent[] = [];
      let t = untilLook(x, ev);
      t += 500;
      ev.push(...x.e.step({ tMs: t, pos: x.me, tempo, posOk: true, tempoFromMotion: true }));
      expect(ev.some((e) => e.type === "flee")).toBe(flees);
    });
  }
  it("utan rörelsesensor (tempo ur GPS-fart) tolereras smygande under blicken, men inte gång", () => {
    const x = setup();
    const ev: EngineEvent[] = [];
    let t = untilLook(x, ev);
    t += 500;
    ev.push(...x.e.step({ tMs: t, pos: x.me, tempo: "sneak", posOk: true, tempoFromMotion: false }));
    expect(ev.some((e) => e.type === "flee")).toBe(false);
    t += 500;
    ev.push(...x.e.step({ tMs: t, pos: x.me, tempo: "walk", posOk: true, tempoFromMotion: false }));
    expect(ev.some((e) => e.type === "flee")).toBe(true);
  });
  it("långt bort (utanför medvetenhetsradien) tittar djuret inte", () => {
    const x = setup();
    x.me = simPoint(500, -700);
    const ev: EngineEvent[] = [];
    let t = T0;
    for (let i = 0; i < 200; i++) { t += 500; ev.push(...x.e.step({ tMs: t, pos: x.me, tempo: "walk", posOk: true })); }
    expect(ev.some((e) => e.type === "look_warn")).toBe(false);
  });
});

describe("spår på kartan", () => {
  it("ett nytt djur får ett spår som leder mot det från spelarens håll; spåret syns bara när djuret självt inte syns", () => {
    const s = newEngineState(T0);
    const e = new WorldEngine(s, env);
    s.budget = 1.4;
    const me = simPoint(-500, -300);
    let t = T0;
    for (let i = 0; i < 5 && !s.active.length; i++) { t += 1000; e.step({ tMs: t, pos: me, tempo: "walk", posOk: true }); }
    const a = s.active[0];
    expect(a).toBeDefined();
    expect(a.trail!.length).toBeGreaterThan(3);
    // Spåret slutar nära djuret och börjar närmare spelaren än djuret är.
    expect(haversineM(a.trail![a.trail!.length - 1], a.pos)).toBeLessThan(25);
    expect(haversineM(a.trail![0], me)).toBeLessThan(haversineM(a.pos, me));
    for (const p of a.trail!) expect(env.blocked(p)).toBe(false);
    const d = haversineM(a.pos, me);
    expect(e.trails(me).length).toBe(d > BEHAVIOR.visibleM ? 1 : 0);
    expect(e.visible(me).length).toBe(d > BEHAVIOR.visibleM ? 0 : 1);
  });
});
