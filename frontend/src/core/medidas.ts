/**
 * Medidas de la interfaz, tomadas de Volki a 1917×930 px (ver `medidasVolki.md`).
 * Todas las pantallas leen de aquí; ningún número de tamaño debe repetirse
 * suelto en una pantalla. Los colores NO están aquí: viven en `core/color.ts`.
 */
export const MEDIDAS = {
  /** Menú lateral y barra superior */
  menuAncho: 196,
  barraAlto: 50,

  /** Relleno lateral y de fondo del contenido */
  contenidoX: 32,
  contenidoAbajo: 32,

  /** Panel izquierdo (blanco) y columna derecha de las pantallas de cliente/paciente */
  panelRadio: 22,
  lateralPorcentaje: 24.4,
  lateralMin: 340,
  lateralMax: 440,
  lateralRelleno: '8px 24px',

  /** Tarjetas y tablas */
  tarjetaRadio: 16,
  tarjetaRelleno: 16,
  tarjetaSeparacion: 16,
  tablaFila: 49,
  tablaCabecera: 35,

  /** Pestañas, botones y campos */
  pestanaAlto: 49,
  pestanaSeparacion: 32,
  botonAlto: 36,
  botonRadio: 8,
  campoAlto: 56,

  /** Letra: 14 px con 20 px de interlínea */
  letra: 14,
  interlinea: 20,
  letraMigas: 15,
  tituloLateral: 22,
  tituloSeccion: 20,
} as const

/** Ancho de la columna derecha para una ventana de `ancho` px, como en Volki (≈24 %). */
export function anchoLateral(ancho: number): number {
  const px = Math.round((ancho * MEDIDAS.lateralPorcentaje) / 100)
  return Math.min(MEDIDAS.lateralMax, Math.max(MEDIDAS.lateralMin, px))
}
