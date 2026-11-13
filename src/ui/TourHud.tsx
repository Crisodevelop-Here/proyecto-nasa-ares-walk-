import { useMemo, useRef } from 'react'
import { arrivalCode, profile, TOUR_CAMERAS, pointIndexAt, type Arrival, type TourCamera, type TourState } from '../tour/tour'
import type { RoutePlan } from '../types'

interface Props {
  mode: 'region' | 'site'
  plan: RoutePlan
  arrivals: Arrival[]
  /** Snapshot of the live tour state (refreshed by the scene ~12×/s). */
  tour: TourState
  /** Name of the base (start/end). */
  baseName: string
  /** Steepest slope the vehicle / suit can take (°). */
  maxSlope: number
  onPlay: () => void
  onSeek: (d: number) => void
  onSpeed: (s: number) => void
  onCamera: (c: TourCamera) => void
  onExit: () => void
}

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`)
const hm = (h: number) => {
  const H = Math.floor(h)
  const M = Math.round((h - H) * 60)
  return `${H} h ${String(M).padStart(2, '0')} min`
}

export function TourHud({ mode, plan, arrivals, tour, baseName, maxSlope, onPlay, onSeek, onSpeed, onCamera, onExit }: Props) {
  const prof = useMemo(() => profile(plan), [plan])
  const svg = useRef<SVGSVGElement>(null)
  const total = plan.points.length ? plan.points[plan.points.length - 1].d : 1
  const p = plan.points[pointIndexAt(plan, tour.d)] ?? plan.points[0]
  const done = tour.d >= total - 1
  const prevStop = arrivals[tour.next - 1]
  const nextStop = arrivals[tour.next]
  const arrived = tour.hold > 0 && prevStop ? prevStop : null
  const W = 600
  const H = 90
  const x = (d: number) => (d / total) * W
  const y = (z: number) => H - ((z - prof.zMin) / (prof.zMax - prof.zMin)) * H
  const path = prof.d.map((d, i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(prof.z[i]).toFixed(1)}`).join(' ')
  const slopeColor = p.slope < maxSlope * 0.5 ? 'text-emerald-300' : p.slope < maxSlope * 0.8 ? 'text-amber-300' : 'text-rose-300'

  const seek = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect()
    if (!r) return
    onSeek(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * total)
  }

  return (
    <>
      {/* Arrival card */}
      {arrived && (
        <div
          key={arrived.n}
          className="card-in pointer-events-none absolute left-1/2 top-6 z-40 w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#141a2b]/90 p-4 text-white shadow-2xl backdrop-blur"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
            {arrived.last ? 'Llegaste de vuelta al punto A (base)' : `Llegaste al punto ${arrivalCode(arrived)} de ${arrivals.length - 1}`} · {hm(arrived.t)} de misión
          </p>
          <p className="mt-1 text-xl font-bold">
            <span className="mr-2 rounded-lg bg-orange-400 px-2 py-0.5 font-mono text-base text-slate-900">{arrivalCode(arrived)}</span>
            {arrived.station.emoji} {arrived.station.name}
          </p>
          <p className="mt-1 text-sm text-white/80">{arrived.station.goal}</p>
          {!arrived.last && <p className="mt-1.5 text-xs text-white/55">{arrived.station.why}</p>}
          {arrived.station.workMin > 0 && (
            <p className="mt-2 text-xs text-sky-200/80">
              EVA de {arrived.station.workMin} min · {arrived.station.tools.join(' · ')}
            </p>
          )}
        </div>
      )}

      <div className="card-in absolute inset-x-2 bottom-2 z-40 rounded-2xl border border-white/10 bg-[#141a2b]/88 p-3 text-white shadow-2xl backdrop-blur sm:inset-x-6 sm:bottom-6 sm:p-4 lg:inset-x-auto lg:left-1/2 lg:w-[880px] lg:-translate-x-1/2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onPlay}
            className="grid h-10 w-10 place-items-center rounded-full bg-orange-400 text-lg font-bold text-slate-900 transition hover:bg-orange-300"
            title="Espacio"
          >
            {tour.playing ? '❚❚' : done ? '↺' : '▶'}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
              {mode === 'site' ? 'EVA a pie · Monte Sharp' : 'Travesía en rover (tipo Perseverance)'}
            </p>
            <p className="truncate text-sm text-white/85">
              {done ? (
                `Recorrido completo A → ${arrivals
                  .filter((a) => !a.last)
                  .map(arrivalCode)
                  .join(' → ')} → A: ${km(total)} en ${hm(plan.walkHours)} de marcha`
              ) : (
                <>
                  <b className="font-mono text-orange-300">{prevStop ? arrivalCode(prevStop) : 'A'}</b> {prevStop?.station.name ?? baseName}{' '}
                  <span className="text-white/50">→</span> <b className="font-mono text-orange-300">{nextStop ? arrivalCode(nextStop) : 'A'}</b>{' '}
                  {nextStop?.station.name ?? baseName}
                </>
              )}
            </p>
          </div>
          <div className="flex rounded-lg bg-white/5 p-0.5 text-xs">
            {TOUR_CAMERAS.map((c) => (
              <button
                key={c.id}
                onClick={() => onCamera(c.id)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${tour.camera === c.id ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-white/5 p-0.5 text-xs">
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => onSpeed(s)}
                className={`rounded-md px-2 py-1 font-mono transition ${tour.speed === s ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}
              >
                ×{s}
              </button>
            ))}
          </div>
          <button onClick={onExit} className="rounded-lg px-2.5 py-1.5 text-xs text-white/70 ring-1 ring-white/15 transition hover:bg-white/10" title="Esc">
            Salir
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          <Stat label="recorrido" value={`${km(tour.d)} / ${km(total)}`} />
          <Stat label="elevación" value={`${Math.round(p.z).toLocaleString('es-ES')} m`} />
          <Stat label="pendiente" value={`${p.slope.toFixed(1)}°`} className={slopeColor} />
          <Stat label="reloj de misión" value={hm(p.t)} />
          <Stat
            label={tour.hold > 0 ? `trabajando en ${prevStop ? arrivalCode(prevStop) : 'A'}` : `hasta ${nextStop ? arrivalCode(nextStop) : 'A'}`}
            value={tour.hold > 0 ? '⛏' : nextStop ? km(Math.max(0, nextStop.d - tour.d)) : '—'}
            className="hidden sm:block"
          />
        </div>

        {/* Elevation profile: click or drag to move along the route */}
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H + 14}`}
          preserveAspectRatio="none"
          className="mt-3 h-20 w-full cursor-pointer touch-none select-none sm:h-24"
          onPointerDown={(e) => {
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
            seek(e.clientX)
          }}
          onPointerMove={(e) => e.buttons && seek(e.clientX)}
        >
          <defs>
            <linearGradient id="prof" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fb923c" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fb923c" stopOpacity="0.04" />
            </linearGradient>
            <clipPath id="travelled">
              <rect x="0" y="0" width={x(tour.d)} height={H} />
            </clipPath>
          </defs>
          <path d={`${path} L${W},${H} L0,${H} Z`} fill="rgba(255,255,255,0.06)" />
          <path d={path} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          <g clipPath="url(#travelled)">
            <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#prof)" />
            <path d={path} fill="none" stroke="#fb923c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
          {arrivals.map((a) => (
            <g key={a.n}>
              <line x1={x(a.d)} x2={x(a.d)} y1={0} y2={H} stroke="rgba(253,230,138,0.35)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <text x={Math.min(W - 6, Math.max(6, x(a.d)))} y={H + 12} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.6)">
                {arrivalCode(a)}
              </text>
            </g>
          ))}
          <text x={6} y={H + 12} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.6)">
            A
          </text>
          <line x1={x(tour.d)} x2={x(tour.d)} y1={0} y2={H} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <circle cx={x(tour.d)} cy={y(p.z)} r="4" fill="#fff" stroke="#fb923c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-white/40">
          <span>{Math.round(prof.zMin).toLocaleString('es-ES')} m</span>
          <span>Perfil de elevación (MOLA{mode === 'site' ? ' + HiRISE 1 m' : ''}) · clic para moverte · Espacio pausa · C cámara</span>
          <span>{Math.round(prof.zMax).toLocaleString('es-ES')} m</span>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg bg-white/5 px-2 py-1.5 ${className}`}>
      <p className="font-mono text-sm font-semibold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
    </div>
  )
}
