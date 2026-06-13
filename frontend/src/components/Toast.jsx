import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react'

const ToastCtx = createContext(null)

const ESTILOS = {
  success: { Icon: CheckCircle,   barra: 'bg-emerald-500', icono: 'text-emerald-500' },
  error:   { Icon: AlertTriangle, barra: 'bg-rose-500',    icono: 'text-rose-500'    },
  info:    { Icon: Info,          barra: 'bg-sky-500',     icono: 'text-sky-500'     },
}

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), [])

  const push = useCallback((mensaje, tipo = 'info', duracion = 4000) => {
    const id = ++_id
    setToasts(t => [...t, { id, mensaje, tipo }])
    if (duracion) setTimeout(() => remove(id), duracion)
  }, [remove])

  const toast = {
    success: (m, d) => push(m, 'success', d),
    error:   (m, d) => push(m, 'error', d),
    info:    (m, d) => push(m, 'info', d),
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2.5rem)]">
        {toasts.map(({ id, mensaje, tipo }) => {
          const { Icon, barra, icono } = ESTILOS[tipo] ?? ESTILOS.info
          return (
            <div key={id} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex animate-[slideIn_0.2s_ease-out]">
              <div className={`w-1 ${barra}`} />
              <div className="flex items-start gap-3 px-4 py-3 flex-1">
                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${icono}`} />
                <p className="text-sm text-slate-700 flex-1 leading-snug">{mensaje}</p>
                <button onClick={() => remove(id)} className="text-slate-300 hover:text-slate-500 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
