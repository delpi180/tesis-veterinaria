/**
 * Cálculos de dinero de la clínica.
 *
 * Estaban sueltos dentro de las pantallas de Ventas y Caja. Acá cumplen dos
 * propósitos: quedan en un solo lugar donde se pueden leer y comparar, y se
 * pueden probar sin montar la pantalla entera. Un error acá se traduce
 * directo en cobrarle mal a un cliente o en un arqueo que no cuadra.
 */

/** Redondeo a céntimos. En coma flotante 0.1 + 0.2 no da 0.3, y esas colas se
 *  arrastran hasta el total de la boleta. */
export const aCentimos = (n) => {
  const r = Math.round((Number(n) || 0) * 100) / 100
  // `Math.round` devuelve -0 para valores negativos diminutos: un arqueo que
  // cuadra por una cola de coma flotante mostraría "-0.00".
  return r === 0 ? 0 : r
}

/**
 * Totales del carrito.
 *
 * @param {Array<{precio: number|string, cantidad: number}>} carrito
 * @param {number|string} descuentoPct  se recorta a 0–100: un descuento de
 *        120% dejaría un total negativo, y uno negativo cobraría de más.
 */
export function calcularTotales(carrito, descuentoPct = 0) {
  const subtotal = aCentimos(
    (carrito ?? []).reduce(
      (s, l) => s + (Number(l.precio) || 0) * (Number(l.cantidad) || 0),
      0,
    ),
  )
  const pct = Math.max(0, Math.min(100, Number(descuentoPct) || 0))
  const descuento = aCentimos(subtotal * pct / 100)
  return { subtotal, pct, descuento, total: aCentimos(subtotal - descuento) }
}

/**
 * Arqueo: lo contado en el cajón contra lo que dice el sistema.
 *
 * Devuelve `null` cuando todavía no se escribió un monto, para poder
 * distinguir "no contó nada" de "contó cero" — no es lo mismo dejar el campo
 * vacío que declarar que la caja estaba vacía.
 */
export function calcularArqueo(contado, esperado) {
  const n = parseFloat(contado)
  if (contado === '' || contado === null || contado === undefined || Number.isNaN(n)) {
    return { valido: false, contado: null, diferencia: null, cuadra: false }
  }
  const diferencia = aCentimos(n - (Number(esperado) || 0))
  return { valido: n >= 0, contado: n, diferencia, cuadra: diferencia === 0 }
}
