import { describe, it, expect } from 'vitest'
import { leerDosisPorKg, calcularDosis } from './dosis'

describe('dosis por peso', () => {
  it('lee la dosis con coma o punto', () => {
    expect(leerDosisPorKg('2,5 mg/kg')).toEqual({ porKg: 2.5, unidad: 'mg' })
    expect(leerDosisPorKg('1 tableta')).toBeNull()
  })
  it('calcula total, ml y tabletas', () => {
    const r = calcularDosis('4 mg/kg', 12.5, { concentracion: 25, mgPorTableta: 25 })
    expect(r).toMatchObject({ total: 50, ml: 2, tabletas: 2 })
  })
  it('sin peso o sin dosis por kilo no calcula', () => {
    expect(calcularDosis('4 mg/kg', '')).toBeNull()
    expect(calcularDosis('una tableta', 10)).toBeNull()
  })
})
