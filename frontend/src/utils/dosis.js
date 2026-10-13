// Cálculo de dosis por peso. Solo aritmética: no sugiere dosis ni rangos
// terapéuticos, eso lo decide el veterinario.

const DOSIS_KG = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|ui)\s*\/\s*kg/i

/** "4 mg/kg" → { porKg: 4, unidad: "mg" }; null si no es una dosis por peso. */
export function leerDosisPorKg(texto) {
  const m = DOSIS_KG.exec(texto || '')
  if (!m) return null
  return { porKg: parseFloat(m[1].replace(',', '.')), unidad: m[2].toLowerCase() }
}

const redondear = (n) => Math.round(n * 100) / 100

/**
 * Dosis total para el paciente y, si se conoce la concentración, el volumen
 * o las tabletas a dar.
 *   concentracion: mg por ml (líquidos/inyectables) — opcional
 *   mgPorTableta:  mg por tableta — opcional
 */
export function calcularDosis(dosisTexto, pesoKg, { concentracion, mgPorTableta } = {}) {
  const d = leerDosisPorKg(dosisTexto)
  const peso = Number(pesoKg)
  if (!d || !(peso > 0)) return null
  const total = redondear(d.porKg * peso)
  const out = { total, unidad: d.unidad, porKg: d.porKg, peso }
  if (d.unidad === 'mg') {
    if (Number(concentracion) > 0) out.ml = redondear(total / Number(concentracion))
    if (Number(mgPorTableta) > 0) out.tabletas = redondear(total / Number(mgPorTableta))
  }
  return out
}
