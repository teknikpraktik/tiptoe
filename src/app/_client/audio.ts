// Mönster från teknikpraktik/solosurvival@033a121 src/app/_client/audio.ts och src/audio/cue-player.ts (kategori B): ett AudioContext för
// hela appen, väckning efter iOS-avbrott, upplåsning i en användargest, ljud av/på sparat lokalt. Ljuden är nya (syntetiska).
"use client";

import type { Ambience, SoundCue } from "@/audio/director";
import { playCue, startAmbience } from "@/audio/synth";
import { BACKGROUND_SAMPLES, sampleUrl, type SampleId } from "@/audio/samples";
import { ALL_SPECIES } from "@/engine/species";

const KEY = "tiptoe.sound";

export function soundEnabled(): boolean { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } }

/** Appens ljud. Skapas en gång (modulnivå). */
class AudioPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stopAmbience: (() => void) | null = null;
  private ambience: Ambience = "none";
  private listeners = new Set<() => void>();
  /** Inspelade läten: avkodade buffertar, och de som håller på att laddas. */
  private samples = new Map<SampleId, AudioBuffer>();
  private loading = new Set<SampleId>();

  get enabled(): boolean { return soundEnabled(); }
  setEnabled(on: boolean): void {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* privat läge */ }
    if (!on) this.setAmbience("none", true); else this.unlock();
    this.listeners.forEach((f) => f());
  }
  subscribe = (f: () => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };

  /** Anropas i en användargest (Starta promenad, tryck på kartan): skapar och väcker ljudet. */
  unlock(): void {
    if (typeof window === "undefined" || !this.enabled) return;
    try {
      // iOS 17+: "ambient" följer telefonens tysta läge (spec: Ljud följer telefonens tyst-läge) och blandas med annan musik.
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = "ambient";
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: "playback" });
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
      }
      void this.ctx.resume().catch(() => undefined);
      this.preload();
    } catch { /* inget ljud */ }
  }

  /** Sidan döljs: allt ljud vilar (batteri). */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend().catch(() => undefined); else void this.ctx.resume().catch(() => undefined);
  }

  /** Läser in alla inspelade läten (cirka 1,2 MB) i bakgrunden; service workern cachar filerna. */
  private preload(): void {
    for (const id of [...ALL_SPECIES, ...BACKGROUND_SAMPLES] as SampleId[]) void this.load(id);
  }
  private async load(id: SampleId): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.samples.has(id) || this.loading.has(id)) return;
    this.loading.add(id);
    try {
      const r = await fetch(sampleUrl(id));
      if (!r.ok) return;
      const data = await r.arrayBuffer();
      const buf = await new Promise<AudioBuffer>((ok, fail) => { void ctx.decodeAudioData(data, ok, fail)?.catch?.(fail); });
      this.samples.set(id, buf);
    } catch { /* reserven (syntetiskt ljud) används */ } finally { this.loading.delete(id); }
  }
  private playSample(buf: AudioBuffer, pan: number, gain: number): void {
    const ctx = this.ctx!, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(g);
    if (typeof ctx.createStereoPanner === "function") { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(this.master!); } else g.connect(this.master!);
    src.start(ctx.currentTime + 0.02);
  }

  play(c: SoundCue): "played" | "muted" | "locked" {
    if (!this.enabled) return "muted";
    if (!this.ctx || !this.master || this.ctx.state !== "running") { if (this.ctx) void this.ctx.resume().catch(() => undefined); return "locked"; }
    const buf = c.sample ? this.samples.get(c.sample) : undefined;
    if (buf) this.playSample(buf, c.pan, c.gain);
    else { if (c.sample) void this.load(c.sample); playCue(this.ctx, this.master, c); }
    return "played";
  }

  setAmbience(kind: Ambience, force = false): void {
    if (!force && kind === this.ambience) return;
    this.ambience = kind;
    this.stopAmbience?.();
    this.stopAmbience = null;
    if (kind !== "none" && this.enabled && this.ctx && this.master) this.stopAmbience = startAmbience(this.ctx, this.master, kind);
  }
}

export const audio = new AudioPlayer();
