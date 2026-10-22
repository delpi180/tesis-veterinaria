import { describe, expect, it } from 'vitest'
import { COLUMNA_LATERAL, ALTO_UTIL, estilosDisposicion } from './medidasDisposicion'
import { MEDIDAS, anchoLateral } from '@src/core/medidas'

describe('disposición compartida (Clientes, Ficha, Historial, Consulta)', () => {
  it('en PC: rejilla de dos columnas con la lateral de ≈24 % pegada a la derecha', () => {
    const { raiz } = estilosDisposicion(true, 20, true)
    expect(raiz.display).toBe('grid')
    // el contenido nunca se ensancha por lo que tenga dentro (minmax(0, 1fr)) y la lateral sigue un ancho por proporción
    expect(raiz.gridTemplateColumns).toBe(`minmax(0, 1fr) ${COLUMNA_LATERAL}`)
    expect(COLUMNA_LATERAL).toBe('clamp(340px, 24.4%, 440px)')
    expect(raiz.width).toBe('100%')
  })

  it('a 1917 px la lateral mide lo mismo que en Volki (≈421–430 px) y no baja de 340 ni pasa de 440', () => {
    expect(Math.abs(anchoLateral(1917) - 430)).toBeLessThanOrEqual(15)
    expect(anchoLateral(800)).toBe(MEDIDAS.lateralMin)
    expect(anchoLateral(4000)).toBe(MEDIDAS.lateralMax)
  })

  it('en PC: alto de la ventana menos la barra superior y scroll dentro de cada columna', () => {
    const { raiz, central, lateral } = estilosDisposicion(true, 20, true)
    expect(raiz.height).toBe(ALTO_UTIL)
    expect(ALTO_UTIL).toBe('calc(100vh - 50px)')
    expect(raiz.overflow).toBe('hidden')
    for (const columna of [central, lateral]) {
      expect(columna.height).toBe('100%')
      expect(columna.overflowY).toBe('auto')
      expect(columna.overflowX).toBe('hidden')
      expect(columna.minWidth).toBe(0)
    }
  })

  it('el panel blanco lleva el relleno y las esquinas de Volki', () => {
    const { central, lateral } = estilosDisposicion(true, 20, true)
    expect(central.padding).toBe('0 32px 32px')
    expect(central.borderRadius).toBe('0 22px 22px 0')
    expect(lateral.padding).toBe('8px 24px')
  })

  it('sin columna lateral (lista de clientes) el contenido ocupa todo el ancho', () => {
    const { raiz } = estilosDisposicion(true, 20, false)
    expect(raiz.gridTemplateColumns).toBe('minmax(0, 1fr)')
  })

  it('en pantallas chicas todo va en una columna y la lateral queda debajo', () => {
    const { raiz, central, lateral } = estilosDisposicion(false, 12, true)
    expect(raiz.display).toBe('flex')
    expect(raiz.flexDirection).toBe('column')
    expect(raiz.height).toBeUndefined()
    expect(central.overflowY).toBeUndefined()
    expect(lateral.borderTop).toBeDefined()
    expect(lateral.borderLeft).toBeUndefined()
  })
})
