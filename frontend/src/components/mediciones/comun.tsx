import { Card, Typography } from 'antd'
import type { ReactNode } from 'react'
import { BRAND, ESTADO } from '@src/core/color'

const { Text } = Typography

export const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

export const fmtN = (v: number | string | null | undefined) => (v == null ? '—' : v)
export const fmt = (v: number | null | undefined) => (v != null ? v.toFixed(2) : '—')

export const fmtSeg = (s: number | null | undefined) => {
  if (s == null) return '—'
  const m = Math.floor(s / 60), r = Math.round(s % 60)
  return m ? `${m}m ${r}s` : `${r}s`
}

/** Color del Tag de Cronbach's alpha según fiabilidad (≥0.8 buena, ≥0.7 aceptable, ≥0.6 débil). */
export const alphaColor = (a?: number | null): string =>
  a == null ? 'default' : a >= 0.8 ? 'success' : a >= 0.7 ? 'blue' : a >= 0.6 ? 'warning' : 'error'

export const AZUL = '#0ea5e9'

/** Nota SUS (Bangor, Kortum y Miller): A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60. */
export function susGrade(p?: number | null) {
  if (p == null) return { letra: '—', etiqueta: '—', tag: 'default', hex: '#94a3b8', cls: '' }
  if (p >= 90) return { letra: 'A', etiqueta: 'Excelente', tag: 'success', hex: ESTADO.ok, cls: 'success' }
  if (p >= 80) return { letra: 'B', etiqueta: 'Bueno', tag: 'cyan', hex: AZUL, cls: 'cyan' }
  if (p >= 70) return { letra: 'C', etiqueta: 'Aceptable', tag: 'blue', hex: '#3b82f6', cls: 'blue' }
  if (p >= 60) return { letra: 'D', etiqueta: 'Pobre', tag: 'warning', hex: ESTADO.atencion, cls: 'warning' }
  return { letra: 'F', etiqueta: 'Deficiente', tag: 'error', hex: ESTADO.peligro, cls: 'danger' }
}

export function rolLabel(rol?: string | null) {
  const m: Record<string, string> = { veterinario: 'Veterinario', veterinaria: 'Veterinaria', asistente: 'Asistente', admin: 'Admin' }
  return (rol && m[rol]) ?? rol ?? '—'
}

/** Cómo se llama cada método de registro en pantalla y en el Excel. */
export const METODOS = {
  ia: { texto: 'Con IA', csv: 'IA', tag: 'green' },
  manual: { texto: 'Manual', csv: 'Manual', tag: 'orange' },
} as const
export const metodoDe = (m?: string | null) => METODOS[m as keyof typeof METODOS] ?? METODOS.manual

/** Tarjeta de sección con título en mayúsculas pequeñas (igual que las cabeceras de Panel). */
export function Seccion({ titulo, nota, extra, children, animar = true }: {
  titulo: ReactNode; nota?: ReactNode; extra?: ReactNode; children: ReactNode; animar?: boolean
}) {
  return (
    <Card className={animar ? 'tarjeta-viva animar' : 'tarjeta-viva'} title={<span style={{ fontWeight: 500 }}>{titulo}</span>} extra={extra}
      styles={{ header: { background: BRAND.panel } }}>
      {nota && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: -4, marginBottom: 12 }}>{nota}</Text>}
      {children}
    </Card>
  )
}
