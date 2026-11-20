"use client";

/**
 * Spara till Bilder / dela (spec: Web Share API med filer, där iOS erbjuder "Spara bild"). Reserv: nedladdning.
 * Returnerar hur det gick, för fältloggen.
 */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<"shared" | "cancelled" | "downloaded"> {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title }); return "shared"; }
    catch (e) { if ((e as { name?: string }).name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
