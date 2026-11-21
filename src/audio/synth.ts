import type { Ambience, SoundCue } from "./director";

/**
 * Syntetiska ljud med WebAudio (beslut: inga ljudfiler). Brus genom filter och enkla oscillatorer: prassel, knäckt kvist, varningsläten,
 * frys-varning, plask, vingslag, ambient. Kan bytas mot inspelningar senare utan att regin (director.ts) ändras.
 */
type Ctx = AudioContext;

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: Ctx): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

function out(ctx: Ctx, master: AudioNode, pan: number, gain: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = gain;
  if (typeof ctx.createStereoPanner === "function") {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(master);
  } else g.connect(master);
  return g;
}

/** Ett brusutbrott genom ett bandpassfilter med kort envelope. */
function burst(ctx: Ctx, dest: AudioNode, t: number, dur: number, freq: number, q: number, peak: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur / 4));
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(e).connect(dest);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

/** En ton med glidande frekvens. */
function tone(ctx: Ctx, dest: AudioNode, t: number, dur: number, f0: number, f1: number, type: OscillatorType, peak: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(peak, t + 0.015);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = Math.max(f0, f1) * 2.5;
  o.connect(lp).connect(e).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

export function playCue(ctx: Ctx, master: AudioNode, c: SoundCue): void {
  const t = ctx.currentTime + 0.02;
  const d = out(ctx, master, c.pan, c.gain);
  switch (c.kind) {
    case "rustle": for (let i = 0; i < 4; i++) burst(ctx, d, t + i * 0.09 + Math.random() * 0.05, 0.12, 2500 + Math.random() * 1500, 1.2, 0.5); break;
    case "twig": burst(ctx, d, t, 0.05, 3200, 2, 0.9); burst(ctx, d, t + 0.07, 0.04, 2600, 2, 0.6); break;
    case "call": tone(ctx, d, t, 0.18, 700, 380, "sawtooth", 0.35); tone(ctx, d, t + 0.35, 0.18, 680, 360, "sawtooth", 0.3); break;
    case "chatter": for (let i = 0; i < 6; i++) tone(ctx, d, t + i * 0.07, 0.05, 2600, 3200, "square", 0.12); break;
    case "grunt": for (let i = 0; i < 3; i++) tone(ctx, d, t + i * 0.25, 0.16, 140, 95, "sawtooth", 0.35); break;
    case "hoot": tone(ctx, d, t, 0.25, 420, 380, "sine", 0.35); tone(ctx, d, t + 0.35, 0.3, 400, 330, "sine", 0.3); break;
    case "warn": tone(ctx, d, t, 0.12, 1500, 1500, "triangle", 0.4); tone(ctx, d, t + 0.16, 0.12, 1100, 1100, "triangle", 0.4); break;
    case "flee": for (let i = 0; i < 8; i++) burst(ctx, d, t + i * 0.06, 0.1, 1200 + i * 150, 0.8, 0.6); break;
    case "splash": burst(ctx, d, t, 0.5, 700, 0.6, 0.8); burst(ctx, d, t + 0.05, 0.35, 2200, 0.8, 0.4); break;
    case "wings": for (let i = 0; i < 6; i++) burst(ctx, d, t + i * 0.13, 0.1, 500, 0.7, 0.7); break;
    case "chime": tone(ctx, d, t, 0.6, 880, 880, "sine", 0.25); tone(ctx, d, t + 0.12, 0.7, 1320, 1320, "sine", 0.2); break;
    case "shutter": burst(ctx, d, t, 0.03, 4000, 1, 0.8); burst(ctx, d, t + 0.06, 0.04, 3000, 1, 0.6); break;
  }
}

/** Ambient: ett brusskikt (vind, vatten, stadsbrus) och i skogen enstaka fågelkvitter. Returnerar en funktion som stänger av. */
export function startAmbience(ctx: Ctx, master: AudioNode, kind: Ambience): () => void {
  if (kind === "none") return () => undefined;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(kind === "urban" ? 0.05 : 0.04, ctx.currentTime + 2);
  g.connect(master);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx); src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = kind === "water" ? "bandpass" : "lowpass";
  f.frequency.value = kind === "urban" ? 220 : kind === "water" ? 650 : 900;
  f.Q.value = kind === "water" ? 0.5 : 0.7;
  // Långsam variation (vindbyar, vågor).
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = kind === "water" ? 0.35 : 0.08; lfoGain.gain.value = kind === "water" ? 200 : 300;
  lfo.connect(lfoGain).connect(f.frequency);
  src.connect(f).connect(g);
  src.start(); lfo.start();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const bird = () => {
    for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) tone(ctx, g, ctx.currentTime + i * 0.12, 0.08, 3000 + Math.random() * 1500, 3800 + Math.random() * 1500, "sine", 0.6);
    timer = setTimeout(bird, 3000 + Math.random() * 6000);
  };
  if (kind === "forest") timer = setTimeout(bird, 1500);
  return () => {
    if (timer) clearTimeout(timer);
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    setTimeout(() => { try { src.stop(); lfo.stop(); g.disconnect(); } catch { /* redan stoppat */ } }, 1700);
  };
}
