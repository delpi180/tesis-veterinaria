import { useState, useEffect } from 'react'
import { RefreshCw, Check, Monitor, Server, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../services/api'
import { useRefrescoAuto } from '../hooks/useRefrescoAuto'

const INTERVALO_MS = 30000

const fmtFechaHora = (iso) => iso
  ? new Date(iso).toLocaleString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  : '—'

const ORIGEN = {
  frontend: { label: 'Navegador', Icon: Monitor, cls: 'bg-sky-100 text-sky-800' },
  backend:  { label: 'Servidor',  Icon: Server,  cls: 'bg-purple-100 text-purple-800' },
}

/**
 * Errores del sistema, para dar soporte sin depender del relato del usuario.
 *
 * No es una pantalla que se mire a diario: existe para cuando la clínica avisa
 * que algo no funciona y hay que saber qué pasó, en qué pantalla y a quién.
 */
export default function Errores() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refrescando, setRefrescando] = useState(false)
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [abierto, setAbierto] = useState(null)

  const cargar = (silencioso = false, pendientes = soloPendientes) => {
    if (!silencioso) setLoading(true)
    return api.get(`/api/errores/?solo_pendientes=${pendientes}&limite=100`)
      .then(d => { setItems(Array.isArray(d) ? d : []); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar(false, soloPendientes) }, [soloPendientes])
  useRefrescoAuto(() => cargar(true, soloPendientes), INTERVALO_MS)

  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  const marcarVisto = async (e) => {
    try {
      await api.put(`/api/errores/${e.id}/visto`)
      // Con el filtro de pendientes activo desaparece de la lista; si no,
      // solo cambia de estado.
      setItems(prev => soloPendientes
        ? prev.filter(x => x.id !== e.id)
        : prev.map(x => x.id === e.id ? { ...x, visto: true } : x))
    } catch (err) {
      setError(err.message)
    }
  }

  const hoy = new Date().toLocaleDateString('es-PE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 static md:sticky md:top-0 md:z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Errores del sistema</h1>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{hoy}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={soloPendientes}
              onChange={e => setSoloPendientes(e.target.checked)}
              className="rounded border-slate-300 text-purple-600 focus:ring-purple-300" />
            Solo sin revisar
          </label>
          <button onClick={refrescar} disabled={refrescando}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </header>

      <main className="flex-1 min-w-0 px-4 md:px-6 py-4 md:py-6 max-w-4xl w-full mx-auto flex flex-col gap-4">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <p className="text-xs text-slate-500">
          Cuando algo falla en la clínica queda registrado acá con su contexto, en
          vez de perderse. Los repetidos se agrupan y muestran cuántas veces pasó.
        </p>

        {loading ? (
          <p className="text-sm text-slate-500 text-center py-12">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 bg-white rounded-xl border border-slate-200">
            <Check className="w-8 h-8 mb-2 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700">
              {soloPendientes ? 'Sin errores pendientes de revisar' : 'Sin errores registrados'}
            </p>
            <p className="text-xs mt-1">Todo viene funcionando.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map(e => {
              const o = ORIGEN[e.origen] ?? ORIGEN.frontend
              const expandido = abierto === e.id
              return (
                <div key={e.id}
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden ${e.visto ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}>
                  <div className="px-4 py-3 flex items-start gap-3">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 ${o.cls}`}>
                      <o.Icon className="w-3 h-3" /> {o.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 break-words">{e.mensaje}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {e.ruta && <span className="font-mono">{e.ruta}</span>}
                        {e.usuario && <> · {e.usuario}</>}
                        {' · '}{fmtFechaHora(e.fecha)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {e.veces > 1 && (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full"
                          title="Veces que ocurrió">
                          ×{e.veces}
                        </span>
                      )}
                      {!e.visto && (
                        <button onClick={() => marcarVisto(e)} title="Marcar como revisado"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition">
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      {e.detalle && (
                        <button onClick={() => setAbierto(expandido ? null : e.id)}
                          title={expandido ? 'Ocultar detalle' : 'Ver detalle técnico'}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-700 hover:bg-purple-50 transition">
                          {expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                  {expandido && e.detalle && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                      <pre className="text-[11px] text-slate-700 whitespace-pre-wrap break-words max-h-72 overflow-y-auto font-mono">
{e.detalle}
                      </pre>
                      {e.navegador && (
                        <p className="text-[11px] text-slate-500 mt-2 break-words">
                          <span className="font-semibold">Navegador:</span> {e.navegador}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
