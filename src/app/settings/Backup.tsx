"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Repo } from "@/storage/repo";
import { ImportError, applyImport, exportProfile, parseImport, type ParsedImport } from "@/storage/transfer";
import { BUILD_ID } from "../_client/build";
import { Modal } from "../_client/Modal";
import { useLang, useT } from "../_client/i18n";
import { useSession, useWalkView } from "../_client/SessionProvider";
import { shareOrDownload } from "../_client/share";

const mb = (b?: number) => `${((b ?? 0) / 1e6).toFixed(1)} MB`;

/** Säkerhetskopia (spec: Export och import; Lagring – varning om dataförlust, påminnelse om export, persist() och lagringsanvändning). */
export function Backup() {
  const t = useT();
  const { setLang } = useLang();
  const ctx = useSession();
  const v = useWalkView();
  const [info, setInfo] = useState<{ used?: number; quota?: number; persisted: boolean | null; last: number | null }>({ persisted: null, last: null });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ParsedImport | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const repo = ctx?.db ? new Repo(ctx.db) : null;
  const pid = v?.profile?.id;
  const locked = v?.stage === "walking";
  const fmtDate = (ms: number) => new Date(ms).toLocaleString(v?.profile?.lang === "en" ? "en-GB" : "sv-SE", { dateStyle: "medium", timeStyle: "short" });

  const refresh = useCallback(async () => {
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
    const last = ctx?.db && pid ? await new Repo(ctx.db).lastExport(pid) : null;
    setInfo({ used: est?.usage, quota: est?.quota, persisted, last });
  }, [ctx?.db, pid]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!repo || !pid || !v?.profile) return null;
  const doExport = async () => {
    if (!confirm(t("backup.exportWarn"))) return;
    setBusy(true);
    try {
      const { bytes } = await exportProfile(repo, pid, BUILD_ID);
      const name = `tiptoe-${v.profile!.name.replace(/[^\p{L}\p{N}_-]+/gu, "_")}-${new Date().toISOString().slice(0, 10)}.zip`;
      await shareOrDownload(new Blob([bytes as BlobPart], { type: "application/zip" }), name, "Tiptoe");
      await repo.setLastExport(pid, Date.now());
      await refresh();
    } finally { setBusy(false); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    try { setPending(parseImport(new Uint8Array(await f.arrayBuffer()))); }
    catch (e) { setMsg(t(`backup.error.${e instanceof ImportError ? e.problem : "wrong_format"}`)); }
    if (file.current) file.current.value = "";
  };
  const doImport = async (as: "new" | "replace") => {
    if (!pending || !ctx) return;
    const target = v.profiles.find((x) => x.id === pending.data.profile.id) ?? v.profile!;
    if (as === "replace" && !confirm(t("backup.replaceConfirm", { name: target.name }))) return;
    setBusy(true);
    try {
      let n = v.profiles.length + 1;
      while (v.profiles.some((x) => x.id === `p${n}`)) n++;
      const p = await applyImport(repo, pending, as === "new" ? { mode: "new", newId: `p${n}` } : { mode: "replace", profileId: target.id });
      await ctx.session.switchProfile(p.id);
      setLang(p.lang);
      setMsg(t("backup.imported", { name: p.name }));
    } finally { setBusy(false); setPending(null); }
  };
  const replaceTarget = pending ? v.profiles.find((x) => x.id === pending.data.profile.id) ?? v.profile : null;

  return (
    <section className="card form" data-testid="settings-backup">
      <h3>{t("backup.title")}</h3>
      <p className="warn-text">{t("backup.warning")}</p>
      <p className="muted">{t("backup.storage", { used: mb(info.used), quota: mb(info.quota) })} · {t("backup.persisted", { state: info.persisted == null ? "–" : info.persisted ? t("field.yes") : t("field.no") })}</p>
      <p className="muted" data-testid="last-export">{t("backup.lastExport", { date: info.last ? fmtDate(info.last) : t("backup.never") })}</p>
      <button className="btn primary" onClick={doExport} disabled={busy} data-testid="export">{busy ? t("backup.exporting") : t("backup.export")}</button>
      <button className="btn" onClick={() => file.current?.click()} disabled={busy || locked} data-testid="import">{t("backup.import")}</button>
      <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={(e) => void onFile(e.target.files?.[0])} data-testid="import-file" />
      {msg && <p role="status" data-testid="backup-msg">{msg}</p>}
      {pending && (
        <Modal title={t("backup.importTitle")} onClose={() => setPending(null)} actions={<>
          <button className="btn primary" onClick={() => void doImport("new")} disabled={busy} data-testid="import-new">{t("backup.asNew")}</button>
          <button className="btn" onClick={() => void doImport("replace")} disabled={busy} data-testid="import-replace">{t("backup.replace", { name: replaceTarget?.name ?? "" })}</button>
        </>}>
          <p data-testid="import-summary">{t("backup.importSummary", { name: pending.data.profile.name, walks: pending.manifest.counts.walks, reserves: pending.manifest.counts.reserves, photos: pending.manifest.counts.photos, observations: pending.manifest.counts.observations, date: fmtDate(Date.parse(pending.manifest.exportedAt)) })}</p>
        </Modal>
      )}
    </section>
  );
}
