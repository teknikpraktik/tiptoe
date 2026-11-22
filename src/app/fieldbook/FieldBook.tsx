"use client";

import { useEffect, useMemo, useState } from "react";
import { fieldBook, type SpeciesEntry } from "@/engine/progress";
import { SPECIES } from "@/engine/species";
import { Repo, type Observation } from "@/storage/repo";
import { animalManifest, type AnimalManifest } from "../_client/animalImages";
import { Modal, PageHeader } from "../_client/Modal";
import { useT } from "../_client/i18n";
import { useSession, useWalkView } from "../_client/SessionProvider";
import { shareOrDownload } from "../_client/share";
import { asciiFileName } from "@/config/brand";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

/** Ett foto ur IndexedDB som objekt-URL (släpps när komponenten försvinner). */
function usePhotoUrl(repo: Repo | null, id: string | null): { url: string; blob: Blob } | null {
  const [v, setV] = useState<{ url: string; blob: Blob } | null>(null);
  useEffect(() => {
    if (!repo || !id) return;
    let url: string | null = null, cancelled = false;
    void repo.photo(id).then((p) => { if (p && !cancelled) { url = URL.createObjectURL(p.blob); setV({ url, blob: p.blob }); } });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [repo, id]);
  return v;
}

function Thumb({ repo, id, onOpen }: { repo: Repo | null; id: string; onOpen: () => void }) {
  const p = usePhotoUrl(repo, id);
  // eslint-disable-next-line @next/next/no-img-element
  return <button className="thumb" onClick={onOpen}>{p && <img src={p.url} alt="" />}</button>;
}

/** Fältdagboken (spec: Fältdagbok): arter grupperade, silhuett för saknade, individer, bästa betyg, varianter, foton i stort format, dela. */
export function FieldBookPage() {
  const t = useT();
  const ctx = useSession();
  const v = useWalkView();
  const repo = useMemo(() => (ctx?.db ? new Repo(ctx.db) : null), [ctx?.db]);
  const [obs, setObs] = useState<Observation[]>([]);
  const [manifest, setManifest] = useState<AnimalManifest | null>(null);
  const [open, setOpen] = useState<SpeciesEntry | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const big = usePhotoUrl(repo, photo);
  const profileId = v?.profile?.id;
  useEffect(() => { void animalManifest().then(setManifest); }, []);
  useEffect(() => { if (repo && profileId) void repo.observations(profileId).then(setObs); }, [repo, profileId, v?.score.total]);
  const fb = useMemo(() => fieldBook(obs), [obs]);

  return (
    <main className="page">
      <PageHeader title={t("fieldbook.title")} />
      <div className="pagebody">
        <div className="card fbhead" data-testid="fieldbook-head" style={{ backgroundImage: "linear-gradient(rgba(20,24,18,.55), rgba(20,24,18,.85)), url(/backgrounds/lake.webp)" }}>
          <h3>{t(`title.${fb.title}`)}</h3>
          <p>{t("fieldbook.count", { found: fb.speciesFound, total: fb.total })} · {t("fieldbook.points", { n: v?.score.total ?? 0 })}</p>
          <p className="muted">{fb.nextTitle ? t("fieldbook.next", { n: fb.nextTitle.species - fb.speciesFound, title: t(`title.${fb.nextTitle.id}`) }) : fb.speciesFound >= fb.total ? t("fieldbook.allFound") : t("fieldbook.bonusLeft")}</p>
        </div>
        {fb.speciesFound === 0 && <p className="muted">{t("fieldbook.empty")}</p>}
        <div className="fbgrid">
          {fb.entries.map((e) => {
            const img = manifest?.species[e.species]?.views.side.calm.src;
            return (
              <button key={e.species} className={`fbcell ${e.found ? "found" : "missing"} r-${SPECIES[e.species].rarity}`} onClick={() => e.found && setOpen(e)} disabled={!e.found} data-testid={`fb-${e.species}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img && <img src={img} alt="" />}
                <span className="fbname">{e.found ? t(`species.${e.species}`) : "?"}</span>
                {e.found && <span className="fbstars">{stars(e.bestStars)}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {open && !photo && (
        <Modal title={t(`species.${open.species}`)} onClose={() => setOpen(null)} actions={<button className="btn" onClick={() => setOpen(null)}>{t("common.close")}</button>}>
          <p className="muted">{t(`fieldbook.class.${SPECIES[open.species].rarity}`)} · {t("fieldbook.points", { n: SPECIES[open.species].points })}</p>
          <p>{t("fieldbook.individuals", { n: open.individuals })} · {t("fieldbook.photos", { n: open.photos })} · {t("fieldbook.best", { stars: stars(open.bestStars) })}</p>
          {open.variants.length > 0 && <p className="rare-text">{t("fieldbook.variants", { list: open.variants.map((x) => t(`variant.${x}` as "variant.dark")).join(", ") })}</p>}
          {open.photoIds.length ? <div className="thumbs">{open.photoIds.map((id) => <Thumb key={id} repo={repo} id={id} onOpen={() => setPhoto(id)} />)}</div> : <p className="muted">{t("fieldbook.noPhotos")}</p>}
        </Modal>
      )}
      {photo && (
        <Modal title={open ? t(`species.${open.species}`) : ""} onClose={() => setPhoto(null)} actions={<>
          <button className="btn primary" onClick={() => setPhoto(null)}>{t("common.back")}</button>
          <button className="btn" disabled={!big} onClick={() => big && void shareOrDownload(big.blob, asciiFileName(`djurfoto-${photo}.jpg`), t("camera.photoTitle"))}>{t("camera.share")}</button>
        </>}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {big && <img src={big.url} alt="" className="photo" />}
        </Modal>
      )}
    </main>
  );
}
