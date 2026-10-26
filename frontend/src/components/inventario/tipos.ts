/** Datos y textos comunes de Inventario (página y ventanas). */

export interface Producto {
  id: number
  codigo?: string | null
  nombre: string
  descripcion?: string | null
  categoria?: string | null
  proveedor?: string | null
  unidad?: string | null
  precio: number | string
  stock: number
  stock_minimo: number
  activo: boolean
  stock_bajo?: boolean
  valor_stock?: number | null
  fecha_vencimiento?: string | null
  lote?: string | null
  estado_vencimiento?: 'vigente' | 'por_vencer' | 'vencido' | null
  dias_para_vencer?: number | null
}

// Categorías admitidas por el backend (schemas.ProductoCreate)
export const CATEGORIAS = ['comida', 'accesorio', 'medicamento'] as const

export const CAT_LABEL: Record<string, string> = {
  comida: 'Comida',
  accesorio: 'Accesorio',
  medicamento: 'Medicamento',
}

export const CAT_COLOR: Record<string, string> = {
  comida: 'gold',
  accesorio: 'default',
  medicamento: 'green',
}

export const OPCIONES_CATEGORIA = CATEGORIAS.map(c => ({ value: c, label: CAT_LABEL[c] }))

export const fmtMoneda = (n: number | string) =>
  `S/ ${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtFecha = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')
