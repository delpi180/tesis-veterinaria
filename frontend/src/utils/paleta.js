// Paleta de marca a partir de UN color.
//
// Cada clínica elige su color. De él se derivan los once tonos (50 a 950) que
// usa toda la interfaz, y se garantiza que el texto blanco sobre los tonos
// 600 y más oscuros sea legible aunque la clínica elija un color claro
// (un amarillo, por ejemplo): en vez de respetar el color a ciegas, se oscurece
// lo necesario para cumplir el contraste mínimo de accesibilidad (WCAG AA).

export const COLOR_POR_DEFECTO = '#0f766e'
export const TONOS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

const RE_HEX = /^#[0-9a-f]{6}$/i
export const esHexValido = (v) => RE_HEX.test(String(v || '').trim())

const aRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const aHex = (rgb) => '#' + rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')
const mezclar = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t)

const BLANCO = [255, 255, 255]
const NEGRO = [0, 0, 0]

const luminancia = (rgb) => {
  const [r, g, b] = rgb.map(c => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Relación de contraste WCAG entre dos colores hex (de 1 a 21). */
export function contraste(hexA, hexB) {
  const [la, lb] = [luminancia(aRgb(hexA)), luminancia(aRgb(hexB))].sort((x, y) => y - x)
  return (la + 0.05) / (lb + 0.05)
}

// Texto blanco sobre el tono 600 (botones, barras): se exige bastante más que
// el mínimo de 4.5 para que los tonos 500 y 400 usados como iconos también
// queden por encima de 3.
const CONTRASTE_MINIMO_600 = 5.5

/** Los once tonos de la marca, a partir del color elegido. */
export function generarPaleta(hex) {
  const base = aRgb(esHexValido(hex) ? hex.toLowerCase() : COLOR_POR_DEFECTO)

  // 600: el color elegido, oscurecido solo lo necesario para que el blanco se lea.
  let c600 = base
  for (let i = 0; i < 40 && contraste(aHex(c600), '#ffffff') < CONTRASTE_MINIMO_600; i++) {
    c600 = mezclar(c600, NEGRO, 0.04)
  }

  const claro = (t) => aHex(mezclar(c600, BLANCO, t))
  const oscuro = (t) => aHex(mezclar(c600, NEGRO, t))
  return {
    50: claro(0.95), 100: claro(0.88), 200: claro(0.75), 300: claro(0.58),
    400: claro(0.38), 500: claro(0.18), 600: aHex(c600),
    700: oscuro(0.22), 800: oscuro(0.42), 900: oscuro(0.58), 950: oscuro(0.72),
  }
}

/** Aplica la paleta a toda la interfaz. Sin color vuelve a la de por defecto. */
export function aplicarMarca(hex) {
  if (typeof document === 'undefined') return
  const raiz = document.documentElement.style
  if (!esHexValido(hex)) {
    TONOS.forEach(t => raiz.removeProperty(`--color-brand-${t}`))
    return
  }
  const paleta = generarPaleta(hex)
  TONOS.forEach(t => raiz.setProperty(`--color-brand-${t}`, paleta[t]))
}

/** Color de marca vigente (tono dado) en hex: el de la clínica, o el de por defecto. */
export function hexMarca(tono = 600) {
  let hex = ''
  try {
    hex = getComputedStyle(document.documentElement).getPropertyValue(`--color-brand-${tono}`).trim()
  } catch { /* sin documento (pruebas, servidor) */ }
  return esHexValido(hex) ? hex.toLowerCase() : generarPaleta(COLOR_POR_DEFECTO)[tono]
}

/** Lo mismo como [r, g, b], para los PDF (jsPDF no entiende variables CSS). */
export const rgbMarca = (tono = 600) => aRgb(hexMarca(tono))
