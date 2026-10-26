import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { message } from 'antd'

interface Avisos {
  success: (mensaje: ReactNode, duracionMs?: number) => void
  error: (mensaje: ReactNode, duracionMs?: number) => void
  info: (mensaje: ReactNode, duracionMs?: number) => void
}

const ToastCtx = createContext<Avisos | null>(null)

/** Avisos breves (éxito, error, info) con el componente `message` de Ant Design. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [api, contexto] = message.useMessage({ maxCount: 3 })

  const toast = useMemo<Avisos>(() => {
    const mostrar = (tipo: 'success' | 'error' | 'info') => (mensaje: ReactNode, duracionMs = 4000) => {
      api.open({ type: tipo, content: mensaje, duration: duracionMs / 1000 })
    }
    return { success: mostrar('success'), error: mostrar('error'), info: mostrar('info') }
  }, [api])

  return (
    <ToastCtx.Provider value={toast}>
      {contexto}
      {children}
    </ToastCtx.Provider>
  )
}

export function useToast(): Avisos {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
