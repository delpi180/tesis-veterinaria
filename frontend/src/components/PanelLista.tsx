/**
 * Piezas comunes de los paneles con listas (Inicio, Mi panel): una tarjeta con
 * título y una fila que puede ser clicable. La fila clicable también se maneja
 * con el teclado (Tab para llegar, Enter o Espacio para abrirla).
 */
import type { KeyboardEvent, ReactNode } from 'react'
import { Card, Space } from 'antd'
import { BRAND } from '@src/core/color'

/** Un panel con título y un enlace opcional a la derecha. */
export function Panel({ titulo, icono, accion, children }: {
  titulo: string
  icono?: ReactNode
  accion?: ReactNode
  children: ReactNode
}) {
  return (
    <Card
      title={<Space>{icono}{titulo}</Space>}
      extra={accion}
      className="tarjeta-viva animar"
      styles={{ body: { padding: 0 } }}
      style={{ height: '100%' }}
    >
      {children}
    </Card>
  )
}

/** Una fila dentro de un panel: contenido a la izquierda, acciones a la derecha. */
export function Fila({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const alTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return   // las teclas de un botón interno no abren la fila
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() }
  }
  return (
    <div
      onClick={onClick}
      onKeyDown={onClick ? alTeclado : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={onClick ? 'fila-hover' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
        borderTop: `1px solid ${BRAND.border}`, cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  )
}
