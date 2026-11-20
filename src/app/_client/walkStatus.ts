/** Om en promenad pågår (appglobalt). Service workern visar ingen uppdateringsrad och byter aldrig version mitt i en promenad. */
let active = false;
const subs = new Set<() => void>();
export const walkStatus = {
  get: () => active,
  set(v: boolean) { if (v !== active) { active = v; subs.forEach((f) => f()); } },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
