import { Component } from 'react'
import { reportarError } from '../services/reportarError'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    // Además de la consola, se avisa al servidor: quien da soporte no tiene
    // forma de ver la consola del navegador de la clínica.
    reportarError(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-slate-50 px-6">
          <div className="bg-white rounded-xl border border-red-200 shadow-sm px-8 py-7 max-w-md w-full text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-red-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">Ocurrió un error inesperado</h2>
            {/* Antes acá decía "revisa la consola del navegador": un consejo
                inútil para quien atiende en el mostrador. Ahora el fallo se
                reporta solo y se le dice a la persona qué hacer de verdad. */}
            <p className="text-sm text-slate-600 mb-3">
              Ya avisamos al soporte técnico automáticamente. Vuelve a cargar la
              aplicación; si el problema sigue, avisa qué estabas haciendo.
            </p>
            <p className="text-xs text-slate-500 mb-5 font-mono bg-slate-50 rounded px-3 py-2 text-left break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => {
                this.setState({ error: null })
                window.location.reload()
              }}
              className="px-5 py-2.5 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg transition"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
