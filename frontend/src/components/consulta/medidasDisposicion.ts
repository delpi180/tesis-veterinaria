/**
 * Medidas de la disposición compartida (Clientes, Ficha del dueño, Historial y
 * Consulta), tomadas de Volki (`core/medidasVolki.md`). Viven aparte de
 * `Disposicion.tsx` para poder probarlas sin pintar nada y para que las
 * cuatro pantallas no puedan divergir.
 *
 * La regla: en PC la página es gris/crema y encima hay dos columnas: el panel
 * blanco (`minmax(0, 1fr)`, ocupa lo que sobra y NUNCA se ensancha por lo que
 * tenga dentro; esquinas derechas de 22 px) y la lateral, de ≈24 % del ancho,
 * pegada al borde derecho y sin caja propia. La altura es la de la ventana menos
 * la barra superior y cada columna desplaza su contenido: la página no tiene
 * barra de scroll propia, así que nada se mueve al cambiar de pantalla.
 */
import type { CSSProperties } from 'react'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

/** Ancho de la columna lateral: ≈24 % de la ventana, entre 340 y 440 px (en Volki mide 421–430 a 1917). */
export const COLUMNA_LATERAL = `clamp(${MEDIDAS.lateralMin}px, ${MEDIDAS.lateralPorcentaje}%, ${MEDIDAS.lateralMax}px)`
/** Desde este ancho de ventana entra la columna lateral (con el menú de 196 px, antes no queda sitio). */
export const MINIMO_DOS_COLUMNAS = 1200
/** Alto disponible bajo la barra superior de escritorio. */
export const ALTO_UTIL = `calc(100vh - ${MEDIDAS.barraAlto}px)`

export function estilosDisposicion(dosColumnas: boolean, relleno: number, conLateral: boolean) {
  const raiz: CSSProperties = dosColumnas
    ? {
        display: 'grid',
        gridTemplateColumns: conLateral ? `minmax(0, 1fr) ${COLUMNA_LATERAL}` : 'minmax(0, 1fr)',
        height: ALTO_UTIL,
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
        background: BRAND.body,
      }
    : { display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, minHeight: '100vh', background: BRAND.body }

  const central: CSSProperties = {
    minWidth: 0,
    background: BRAND.header,
    ...(dosColumnas
      ? {
          padding: `0 ${MEDIDAS.contenidoX}px ${MEDIDAS.contenidoAbajo}px`,
          borderRadius: `0 ${MEDIDAS.panelRadio}px ${MEDIDAS.panelRadio}px 0`,
          height: '100%', overflowY: 'auto', overflowX: 'hidden',
        }
      : { padding: `0 ${relleno}px ${relleno}px` }),
  }

  const lateral: CSSProperties = {
    minWidth: 0,
    ...(dosColumnas
      ? { padding: MEDIDAS.lateralRelleno, height: '100%', overflowY: 'auto', overflowX: 'hidden' }
      : { padding: relleno, borderTop: `1px solid ${BRAND.border}` }),
  }

  /** Migas de pan: caja del color de la página que «cuelga» del borde superior del panel blanco. */
  const migas: CSSProperties = {
    display: 'inline-block',
    background: BRAND.body,
    padding: '4.8px 16px 8px',
    borderRadius: `0 0 ${MEDIDAS.tarjetaRadio}px ${MEDIDAS.tarjetaRadio}px`,
    fontSize: MEDIDAS.letraMigas,
    lineHeight: `${MEDIDAS.interlinea}px`,
    ...(dosColumnas ? {} : { marginLeft: -relleno }),
  }

  return { raiz, central, lateral, migas }
}
