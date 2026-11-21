/** Exportpåminnelse (spec: Lagring – påminnelse om export): efter 3 avslutade promenader sedan senaste export, eller 14 dagar med nya promenader. */
export const REMINDER = { walks: 3, days: 14 } as const;

export function exportReminder(walkEndedAt: number[], lastExport: number | null, now: number): boolean {
  const since = walkEndedAt.filter((t) => lastExport == null || t > lastExport);
  if (!since.length) return false;
  if (since.length >= REMINDER.walks) return true;
  return now - (lastExport ?? Math.min(...since)) >= REMINDER.days * 86_400_000;
}
