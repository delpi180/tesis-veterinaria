// Compara dos nombres (medicamento, vacuna, etc.) ignorando mayusculas, tildes
// y simbolos, para saber si el dictado por voz se refiere al mismo elemento ya
// presente en una lista (y asi actualizarlo en vez de duplicarlo).

// Quita las marcas diacriticas (tildes) que separa String.normalize('NFD') sin
// depender de un rango unicode escrito como literal de regex.
function sinTildes(s) {
  return Array.from(s).filter(ch => {
    const code = ch.codePointAt(0)
    return !(code >= 0x0300 && code <= 0x036f)
  }).join('')
}

export function nombresSimilares(a, b) {
  if (!a || !b) return false
  const normalizar = (s) => sinTildes(String(s).toLowerCase().trim().normalize('NFD'))
    .replace(/[^a-z0-9\s]/g, '')
  const na = normalizar(a)
  const nb = normalizar(b)
  if (na === nb) return true
  if (na.length > 4 && nb.length > 4) {
    if (na.includes(nb) || nb.includes(na)) return true
  }
  return false
}
