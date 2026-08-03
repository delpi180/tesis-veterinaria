import { describe, it, expect } from 'vitest'
import { aCentimos, calcularTotales, calcularArqueo } from './dinero'

// Lo que se prueba acá termina impreso en la boleta del cliente y en el
// arqueo del día. Un error no rompe la pantalla: cobra mal, que es peor
// porque nadie se entera.

describe('calcularTotales', () => {
  it('suma precio por cantidad de cada línea', () => {
    const { subtotal, total } = calcularTotales([
      { precio: 15, cantidad: 2 },
      { precio: 8.5, cantidad: 3 },
    ])
    expect(subtotal).toBe(55.5)
    expect(total).toBe(55.5)
  })

  it('aplica el descuento sobre el subtotal', () => {
    const r = calcularTotales([{ precio: 100, cantidad: 1 }], 10)
    expect(r.descuento).toBe(10)
    expect(r.total).toBe(90)
  })

  it('no arrastra colas de coma flotante hasta el total', () => {
    // 0.1 + 0.2 en coma flotante da 0.30000000000000004
    const r = calcularTotales([
      { precio: 0.1, cantidad: 1 },
      { precio: 0.2, cantidad: 1 },
    ])
    expect(r.subtotal).toBe(0.3)
  })

  it('recorta descuentos imposibles en vez de cobrar mal', () => {
    // Más de 100% dejaría un total negativo: la clínica devolviéndole plata
    expect(calcularTotales([{ precio: 50, cantidad: 1 }], 150).total).toBe(0)
    // Negativo cobraría de más
    expect(calcularTotales([{ precio: 50, cantidad: 1 }], -20).total).toBe(50)
  })

  it('trata un precio vacío como cero y no como NaN', () => {
    // Los servicios de precio variable arrancan con el campo en blanco: si
    // eso se propagara como NaN, el total entero quedaría en NaN.
    const r = calcularTotales([
      { precio: '', cantidad: 1 },
      { precio: 30, cantidad: 1 },
    ])
    expect(r.total).toBe(30)
  })

  it('un carrito vacío vale cero', () => {
    expect(calcularTotales([]).total).toBe(0)
    expect(calcularTotales(undefined).total).toBe(0)
  })
})

describe('calcularArqueo', () => {
  it('marca que cuadra cuando lo contado es lo esperado', () => {
    const r = calcularArqueo('250.00', 250)
    expect(r.cuadra).toBe(true)
    expect(r.diferencia).toBe(0)
  })

  it('la diferencia es negativa cuando falta plata en el cajón', () => {
    expect(calcularArqueo('240', 250).diferencia).toBe(-10)
  })

  it('la diferencia es positiva cuando sobra', () => {
    expect(calcularArqueo('260', 250).diferencia).toBe(10)
  })

  it('distingue el campo vacío de haber contado cero', () => {
    // No es lo mismo "todavía no conté" que "el cajón estaba vacío": lo
    // primero no debe habilitar el cierre.
    expect(calcularArqueo('', 100).contado).toBeNull()
    expect(calcularArqueo('', 100).diferencia).toBeNull()

    const cero = calcularArqueo('0', 100)
    expect(cero.contado).toBe(0)
    expect(cero.diferencia).toBe(-100)
  })

  it('un monto negativo no es válido', () => {
    expect(calcularArqueo('-5', 100).valido).toBe(false)
  })

  it('no arrastra colas de coma flotante en la diferencia', () => {
    expect(calcularArqueo('0.3', 0.1 + 0.2).diferencia).toBe(0)
  })
})

describe('aCentimos', () => {
  it('redondea a dos decimales', () => {
    expect(aCentimos(10.555)).toBe(10.56)
    expect(aCentimos(10.554)).toBe(10.55)
  })

  it('convierte valores no numéricos a cero', () => {
    expect(aCentimos(null)).toBe(0)
    expect(aCentimos('')).toBe(0)
    expect(aCentimos('abc')).toBe(0)
  })
})
