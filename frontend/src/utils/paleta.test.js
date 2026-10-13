import { describe, it, expect } from 'vitest'
import { generarPaleta, contraste, esHexValido, TONOS, COLOR_POR_DEFECTO } from './paleta'

const MUESTRAS = ['#0f766e', '#ffd400', '#ffffff', '#000000', '#e11d48', '#2563eb', '#a3e635', '#f5f5dc']

describe('paleta de marca', () => {
  it('valida el formato del color', () => {
    expect(esHexValido('#0F766E')).toBe(true)
    expect(esHexValido('0f766e')).toBe(false)
    expect(esHexValido('#fff')).toBe(false)
    expect(esHexValido(null)).toBe(false)
  })

  it('genera los once tonos', () => {
    expect(Object.keys(generarPaleta('#2563eb')).map(Number)).toEqual(TONOS)
  })

  it('el texto blanco se lee sobre 600 y más oscuros, elija el color que elija', () => {
    for (const color of MUESTRAS) {
      const p = generarPaleta(color)
      for (const t of [600, 700, 800, 900, 950]) {
        expect(contraste('#ffffff', p[t]), `${color} tono ${t}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('el texto oscuro se lee sobre los tonos claros', () => {
    for (const color of MUESTRAS) {
      const p = generarPaleta(color)
      for (const t of [50, 100]) {
        expect(contraste(p[700], p[t]), `${color} tono ${t}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('los tonos van de claro a oscuro', () => {
    const p = generarPaleta('#e11d48')
    const lum = (h) => contraste(h, '#000000')
    const orden = TONOS.map(t => lum(p[t]))
    expect([...orden].sort((a, b) => b - a)).toEqual(orden)
  })

  it('un color inválido usa el de por defecto', () => {
    expect(generarPaleta('rojo')).toEqual(generarPaleta(COLOR_POR_DEFECTO))
  })
})
