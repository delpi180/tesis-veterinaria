import { createContext, useCallback, useContext } from 'react'
import type { ReactNode } from 'react'
import { Modal, Typography } from 'antd'
import { ExclamationCircleFilled } from '@ant-design/icons'
import { ESTADO } from '@src/core/color'

const { Text } = Typography

/**
 * Confirmaciones dentro de la aplicación (en vez de `window.confirm`, que en
 * celular rompe con el resto, puede quedar bloqueado por el navegador y es
 * texto plano: no deja resaltar QUÉ se va a perder).
 *
 * Se expone como promesa para que quien llama se lea igual que antes:
 *
 *     if (!await confirmar({ ... })) return
 *
 * El foco arranca en Cancelar, no en el botón destructivo: si alguien viene
 * dándole Enter en cadena, la tecla no debe borrar nada.
 */
export interface OpcionesConfirmar {
  titulo?: string
  mensaje?: string
  detalle?: string | null
  confirmarTexto?: string
  /** Por defecto sí: casi todo uso es un borrado. */
  peligroso?: boolean
}
type Confirmar = (opciones: OpcionesConfirmar | string) => Promise<boolean>

const ConfirmarCtx = createContext<Confirmar | null>(null)

export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [modal, contexto] = Modal.useModal()

  const confirmar = useCallback<Confirmar>((opciones) => {
    const o: OpcionesConfirmar = typeof opciones === 'string' ? { mensaje: opciones } : opciones
    const peligroso = o.peligroso !== false
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        title: o.titulo ?? '¿Confirmas?',
        icon: <ExclamationCircleFilled style={{ color: peligroso ? ESTADO.peligro : ESTADO.atencion }} />,
        content: (
          <>
            {o.mensaje && <div>{o.mensaje}</div>}
            {o.detalle && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>{o.detalle}</Text>}
          </>
        ),
        okText: o.confirmarTexto ?? 'Confirmar',
        okButtonProps: { danger: peligroso },
        cancelText: 'Cancelar',
        autoFocusButton: 'cancel',
        keyboard: true,
        maskClosable: false,
        centered: true,
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
  }, [modal])

  return (
    <ConfirmarCtx.Provider value={confirmar}>
      {contexto}
      {children}
    </ConfirmarCtx.Provider>
  )
}

export function useConfirmar(): Confirmar {
  const ctx = useContext(ConfirmarCtx)
  if (!ctx) throw new Error('useConfirmar debe usarse dentro de <ConfirmarProvider>')
  return ctx
}
