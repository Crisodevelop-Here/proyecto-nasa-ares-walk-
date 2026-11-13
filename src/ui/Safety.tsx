import { Component, type ErrorInfo, type ReactNode } from 'react'

/** True when the browser can create a WebGL context (needed for the 3D view). */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="grid min-h-screen place-items-center bg-[#03040a] p-6 text-white">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">ARES·WALK</p>
        <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/75">{children}</div>
      </div>
    </div>
  )
}

/** Shown instead of the app when the device has no WebGL. */
export function NoWebGL() {
  return (
    <Screen title="Este equipo no puede mostrar 3D">
      <p>ARES·WALK necesita WebGL, la tecnología de gráficos 3D del navegador, y no está disponible aquí.</p>
      <p>Prueba con Chrome, Edge o Firefox actualizados y revisa que la aceleración por hardware esté activada en la configuración del navegador.</p>
    </Screen>
  )
}

interface State {
  error: Error | null
}

/** Catches render errors anywhere below it and shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ARES·WALK] Error en la interfaz:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Screen title="Algo salió mal">
        <p>La app encontró un error inesperado. Tu navegador y tus datos están bien.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-lg bg-orange-400 px-4 py-2 font-semibold text-slate-900 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200"
        >
          Volver a cargar
        </button>
        <p className="font-mono text-xs text-white/40">{this.state.error.message}</p>
      </Screen>
    )
  }
}
