/**
 * Campos de la consulta clínica: etiqueta + entrada, con el resaltado de lo que
 * dejó la IA (fuera de rango, inferido, entendido bien). Todos trabajan con
 * texto, igual que el formulario: nunca convierten el valor por su cuenta.
 */
import { createContext, useContext, useId } from 'react'
import type { CSSProperties, ChangeEvent, ReactNode } from 'react'
import { Flex, Input, Select, Typography, theme } from 'antd'
import { CheckOutlined, WarningOutlined } from '@ant-design/icons'
import type { OpcionCatalogo } from '@src/utils/historiaClinica'

export type Resaltado = 'alerta' | 'ok' | 'inferido' | undefined

/** Estado y colores de antd para un campo resaltado, con los tokens del tema. */
function useResaltado(hl: Resaltado): { status?: 'error' | 'warning'; style?: CSSProperties } {
  const { token } = theme.useToken()
  if (hl === 'alerta') return { status: 'error', style: { background: token.colorErrorBg } }
  if (hl === 'inferido') return { status: 'warning', style: { background: token.colorWarningBg } }
  if (hl === 'ok') return { style: { background: token.colorSuccessBg, borderColor: token.colorSuccessBorder } }
  return {}
}

function AvisoResaltado({ hl }: { hl: Resaltado }) {
  if (hl === 'alerta')
    return (
      <Typography.Text type="danger" strong style={{ fontSize: 11 }}>
        <WarningOutlined /> Fuera de rango — revisa
      </Typography.Text>
    )
  if (hl === 'inferido')
    return (
      <Typography.Text type="warning" strong style={{ fontSize: 11 }}>
        <WarningOutlined /> La IA lo supuso, confirma
      </Typography.Text>
    )
  if (hl === 'ok') return <Typography.Text type="success"><CheckOutlined style={{ fontSize: 11 }} /></Typography.Text>
  return null
}

/** Lo que el campo le pasa a su control: el `id` al que apunta la etiqueta y, si
 *  la fila se repite (varios medicamentos o vacunas), un nombre que la distingue. */
interface DatosCampo { id: string; nombre?: string }
const CampoContext = createContext<DatosCampo | undefined>(undefined)

/** Para controles de antd que no están aquí (AutoComplete, Select de la vacuna). */
export function ConCampo({ children }: { children: (datos: { id?: string; 'aria-label'?: string }) => ReactNode }) {
  const c = useContext(CampoContext)
  return <>{children({ id: c?.id, 'aria-label': c?.nombre })}</>
}

/** Atributos de accesibilidad de un control: el nombre explícito manda; si no, lo
 *  une a la etiqueta del campo (tocar la etiqueta enfoca el control). */
function useAccesible(ariaLabel?: string) {
  const c = useContext(CampoContext)
  return ariaLabel
    ? { 'aria-label': ariaLabel }
    : { id: c?.id, 'aria-label': c?.nombre }
}

interface CampoProps {
  label: string
  hl?: Resaltado
  children: ReactNode
  style?: CSSProperties
  /** Qué fila es («medicamento 2»): el lector de pantalla oye «Dosis, medicamento 2». */
  fila?: string
}

export function Campo({ label, hl, children, style, fila }: CampoProps) {
  const id = useId()
  const { token } = theme.useToken()
  return (
    <Flex vertical gap={4} style={style}>
      <Flex align="center" gap={6} wrap>
        <label
          htmlFor={id}
          style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: token.colorTextSecondary }}
        >
          {label}
        </label>
        <AvisoResaltado hl={hl} />
      </Flex>
      <CampoContext.Provider value={{ id, nombre: fila ? `${label}, ${fila}` : undefined }}>
        {children}
      </CampoContext.Provider>
    </Flex>
  )
}

type CambioTexto = (valor: string) => void

interface EntradaProps {
  value: string
  onChange: CambioTexto
  placeholder?: string
  hl?: Resaltado
  /** Nombre accesible cuando la etiqueta no está pegada al campo. */
  ariaLabel?: string
}

export function EntradaTexto({ value, onChange, placeholder, hl, ariaLabel }: EntradaProps) {
  const r = useResaltado(hl)
  return (
    <Input
      value={value} placeholder={placeholder} {...useAccesible(ariaLabel)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      {...r}
    />
  )
}

interface EntradaNumeroProps extends EntradaProps {
  step?: string
  min?: number
  max?: number
}

export function EntradaNumero({ value, onChange, placeholder, hl, step = 'any', min, max, ariaLabel }: EntradaNumeroProps) {
  const r = useResaltado(hl)
  return (
    <Input
      type="number" inputMode="decimal" step={step} min={min} max={max}
      value={value} placeholder={placeholder} {...useAccesible(ariaLabel)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      {...r}
    />
  )
}

/** Fecha u hora local escrita como texto («2026-10-21T14:30» o «2026-10-21»). */
export function EntradaFecha({ value, onChange, tipo = 'datetime-local', max, ariaLabel }: {
  value: string
  onChange: CambioTexto
  tipo?: 'datetime-local' | 'date'
  max?: string
  ariaLabel?: string
}) {
  return (
    <Input
      type={tipo} value={value} max={max} {...useAccesible(ariaLabel)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  )
}

interface AreaProps extends EntradaProps {
  filas?: number
}

export function AreaTexto({ value, onChange, filas = 3, placeholder, hl, ariaLabel }: AreaProps) {
  const r = useResaltado(hl)
  return (
    <Input.TextArea
      value={value} placeholder={placeholder} {...useAccesible(ariaLabel)}
      autoSize={{ minRows: filas, maxRows: 12 }}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      {...r}
    />
  )
}

export function Selector({ value, onChange, opciones, hl, ariaLabel }: {
  value: string
  onChange: CambioTexto
  opciones: OpcionCatalogo[]
  hl?: Resaltado
  ariaLabel?: string
}) {
  const r = useResaltado(hl)
  return (
    <Select
      value={value || undefined} placeholder="—" allowClear {...useAccesible(ariaLabel)}
      status={r.status}
      options={opciones.map(({ v, l }) => ({ value: v, label: l }))}
      // Vaciar el campo devuelve ''; el formulario guarda "sin dato" como texto vacío
      onChange={(v?: string) => onChange(v ?? '')}
      style={{ width: '100%' }}
    />
  )
}
