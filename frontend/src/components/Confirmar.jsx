import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

/**
 * Confirmaciones dentro de la aplicación.
 *
 * Antes se usaba `window.confirm` en las 13 acciones destructivas. Eso traía
 * tres problemas concretos:
 *
 * 1. En celular abre el diálogo del sistema operativo, que rompe visualmente
 *    con el resto y en algunos navegadores ofrece "impedir que este sitio
 *    muestre más diálogos" — dejando al usuario sin poder borrar nada.
 * 2. Es texto plano: no se puede resaltar QUÉ se va a perder, que es
 *    justamente lo que hay que leer antes de borrar una historia clínica.
 * 3. Bloquea el hilo del navegador mientras está abierto.
 *
 * Se expone como promesa para que el código que llama se lea igual que antes:
 *
 *     if (!await confirmar({ ... })) return
 */
const ConfirmarCtx = createContext(null)

export function ConfirmarProvider({ children }) {
  const [pedido, setPedido] = useState(null)
  const resolverRef = useRef(null)
  const botonRef = useRef(null)

  const confirmar = useCallback((opciones) => {
    // Acepta un string suelto para los casos simples
    const o = typeof opciones === 'string' ? { mensaje: opciones } : opciones
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setPedido({
        titulo: o.titulo ?? '¿Confirmas?',
        mensaje: o.mensaje ?? '',
        detalle: o.detalle ?? null,
        confirmarTexto: o.confirmarTexto ?? 'Confirmar',
        peligroso: o.peligroso !== false,   // por defecto sí: casi todo uso es un borrado
      })
    })
  }, [])

  const responder = useCallback((valor) => {
    setPedido(null)
    resolverRef.current?.(valor)
    resolverRef.current = null
  }, [])

  // El foco arranca en Cancelar, no en el botón destructivo: si alguien viene
  // dándole Enter en cadena, la tecla no debe borrar nada.
  useEffect(() => {
    if (pedido) botonRef.current?.focus()
  }, [pedido])

  useEffect(() => {
    if (!pedido) return
    const alPresionar = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); responder(false) }
    }
    window.addEventListener('keydown', alPresionar, true)
    return () => window.removeEventListener('keydown', alPresionar, true)
  }, [pedido, responder])

  return (
    <ConfirmarCtx.Provider value={confirmar}>
      {children}
      {pedido && (
        <div
          className="fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) responder(false) }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                  pedido.peligroso ? 'text-rose-600' : 'text-amber-500'}`} />
                <p className="text-sm font-bold text-slate-800">{pedido.titulo}</p>
              </div>
              <button onClick={() => responder(false)}
                className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-2 overflow-y-auto">
              {pedido.mensaje && (
                <p className="text-sm text-slate-700 leading-snug">{pedido.mensaje}</p>
              )}
              {pedido.detalle && (
                <p className="text-xs text-slate-500 leading-snug">{pedido.detalle}</p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button
                ref={botonRef}
                type="button"
                onClick={() => responder(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => responder(true)}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition ${
                  pedido.peligroso
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-purple-700 hover:bg-purple-800'}`}
              >
                {pedido.confirmarTexto}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmarCtx.Provider>
  )
}

export function useConfirmar() {
  const ctx = useContext(ConfirmarCtx)
  if (!ctx) throw new Error('useConfirmar debe usarse dentro de <ConfirmarProvider>')
  return ctx
}
