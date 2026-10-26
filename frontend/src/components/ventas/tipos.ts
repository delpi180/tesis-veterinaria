/** Datos y textos comunes de Ventas (página, punto de venta y PDFs). */

export interface ItemVenta {
  descripcion: string
  tipo: 'producto' | 'servicio' | string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface Venta {
  id: number
  fecha: string
  cliente_id: number
  cliente_nombre?: string | null
  cliente_dni?: string | null
  metodo_pago: string
  subtotal?: number | null
  descuento_pct?: number | null
  descuento_monto?: number | null
  total: number
  anulada?: boolean
  motivo_anulacion?: string | null
  anulada_por?: string | null
  items: ItemVenta[]
}

export interface ClienteInfo { id?: number; nombre: string; dni?: string | null; telefono?: string | null }

export const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
]
export const metodoLabel = (m: string) => METODOS_PAGO.find(x => x.value === m)?.label ?? m

export const CAT_LABEL: Record<string, string> = { comida: 'Comida', accesorio: 'Accesorio', medicamento: 'Medicamento' }
export const OPCIONES_CATEGORIA = Object.entries(CAT_LABEL).map(([value, label]) => ({ value, label }))

export const fmtMoneda = (n: number | string) =>
  `S/ ${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
export const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
export const nroBoleta = (id: number) => `B-${String(id).padStart(6, '0')}`

export const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')
