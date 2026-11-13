import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

/** Full-screen loading curtain while the globe textures download; fades out when done. */
export function Loader() {
  const { active, progress } = useProgress()
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!active && progress === 100) {
      const id = setTimeout(() => setGone(true), 700)
      return () => clearTimeout(id)
    }
  }, [active, progress])
  if (gone) return null
  return (
    <div className={`absolute inset-0 z-50 grid place-items-center bg-[#03040a] transition-opacity duration-700 ${!active && progress === 100 ? 'opacity-0' : 'opacity-100'}`}>
      <div className="text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">ARES·WALK</p>
        <p className="mt-2 text-lg">Cargando Marte… {Math.round(progress)} %</p>
      </div>
    </div>
  )
}
