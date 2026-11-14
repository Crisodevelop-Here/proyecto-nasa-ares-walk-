import { useEffect, useRef, useState } from 'react'
import { cameraName, fetchLatestPhotos, GALLERY, type RawPhoto, type RoverWithFeed } from '../data/rawPhotos'
import { locale, t, useLang } from '../i18n'

// One request per rover per visit: switching tabs or places reuses it.
const cache = new Map<RoverWithFeed, Promise<RawPhoto[]>>()
function load(rover: RoverWithFeed) {
  let p = cache.get(rover)
  if (!p) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 15_000)
    p = fetchLatestPhotos(rover, 9, ctl.signal).finally(() => clearTimeout(timer))
    // A failed request is not cached, so the next visit tries again.
    p.catch(() => cache.delete(rover))
    cache.set(rover, p)
  }
  return p
}

const day = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Newest real photos sent by an active rover, with an enlarged view. */
export function RoverPhotos({ rover, name }: { rover: RoverWithFeed; name: string }) {
  const lang = useLang()
  const [photos, setPhotos] = useState<RawPhoto[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  // Each mission section mounts its own gallery (keyed by mission), so `rover` never changes for an instance.
  useEffect(() => {
    let alive = true
    load(rover).then(
      (list) => alive && setPhotos(list),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [rover])

  return (
    <div className="mt-3 rounded-xl bg-white/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-300">{t('Fotos más recientes desde Marte', 'Latest photos from Mars')}</p>
      {failed ? (
        <p className="mt-1.5 text-white/60">
          {t('No se pudieron traer las fotos (hace falta internet).', 'The photos could not be loaded (internet is needed).')}{' '}
          <a href={GALLERY[rover]} target="_blank" rel="noreferrer" className="text-orange-300 hover:underline">
            {t('Verlas en la NASA ↗', 'See them at NASA ↗')}
          </a>
        </p>
      ) : !photos ? (
        <p className="mt-1.5 text-white/60" role="status">
          {t('Trayendo las últimas fotos de {r}…', 'Fetching the latest photos from {r}…', { r: name })}
        </p>
      ) : !photos.length ? (
        <p className="mt-1.5 text-white/60">{t('No hay fotos nuevas por ahora.', 'No new photos right now.')}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-white/55">
            {t('Sol {s} · {d} · tal como llegaron, sin retocar', 'Sol {s} · {d} · as received, unedited', { s: photos[0].sol, d: day(photos[0].date) })}
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-1.5">
            {photos.map((ph, i) => (
              <li key={ph.id}>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="block aspect-square w-full overflow-hidden rounded-lg bg-black/40 ring-orange-300 transition hover:ring-2 focus-visible:ring-2"
                >
                  <img
                    src={ph.thumb}
                    alt={t('{c}, sol {s}', '{c}, sol {s}', { c: cameraName(ph.camera, lang), s: ph.sol })}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
          <a href={GALLERY[rover]} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-orange-300 hover:underline">
            {t('Ver todas las fotos en la NASA ↗', 'See all photos at NASA ↗')}
          </a>
        </>
      )}
      {photos && open !== null && <PhotoViewer photos={photos} index={open} setIndex={setOpen} name={name} />}
    </div>
  )
}

function PhotoViewer({ photos, index, setIndex, name }: { photos: RawPhoto[]; index: number; setIndex: (i: number | null) => void; name: string }) {
  const lang = useLang()
  const ref = useRef<HTMLDialogElement>(null)
  const ph = photos[index]
  const go = (step: number) => setIndex((index + step + photos.length) % photos.length)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label={t('Foto de {r}', 'Photo from {r}', { r: name })}
      onClose={() => setIndex(null)}
      // Keys here belong to the viewer, not to the map (Esc would otherwise also leave the place).
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'ArrowRight') go(1)
        else if (e.key === 'ArrowLeft') go(-1)
      }}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      className="m-auto max-h-[94vh] w-[min(94vw,1000px)] overflow-hidden rounded-2xl border border-white/10 bg-[#141a2b] p-0 text-white shadow-2xl backdrop:bg-black/75"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <p className="text-sm">
          <b>{cameraName(ph.camera, lang)}</b>
          <span className="text-white/60">
            {' '}
            · Sol {ph.sol} · {day(ph.date)}
          </span>
        </p>
        <button type="button" onClick={() => ref.current?.close()} className="rounded-lg px-2.5 py-1 text-sm text-white/70 ring-1 ring-white/15 hover:bg-white/10 hover:text-white">
          {t('Cerrar', 'Close')}
        </button>
      </div>
      <div className="relative bg-black">
        <img src={ph.full} alt={t('{c}, sol {s}', '{c}, sol {s}', { c: cameraName(ph.camera, lang), s: ph.sol })} className="mx-auto max-h-[72vh] w-full object-contain" />
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t('Foto anterior', 'Previous photo')}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-lg hover:bg-black/80"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t('Foto siguiente', 'Next photo')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-lg hover:bg-black/80"
            >
              ›
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-white/60">
        <span>
          {index + 1} / {photos.length} · {t('Crédito', 'Credit')}: {ph.credit}
        </span>
        <a href={ph.link} target="_blank" rel="noreferrer" className="text-orange-300 hover:underline">
          {t('Ver esta foto en la NASA ↗', 'See this photo at NASA ↗')}
        </a>
      </div>
    </dialog>
  )
}
