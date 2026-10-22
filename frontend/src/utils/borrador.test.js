import { beforeEach, describe, expect, it } from 'vitest'
import { FORM_VACIO, claveBorrador, formularioVacio, leerBorrador } from '@src/utils/historiaClinica'

describe('borrador de la consulta', () => {
  beforeEach(() => localStorage.clear())

  it('corregir una consulta guardada no comparte borrador con la consulta nueva', () => {
    expect(claveBorrador(7)).toBe('draft_historia_7')
    expect(claveBorrador(7, 31)).not.toBe(claveBorrador(7))
    expect(claveBorrador(7, 31)).not.toBe(claveBorrador(7, 32))
    expect(claveBorrador(7, null)).toBe(claveBorrador(7))
  })

  it('el borrador recuerda con qué modo se estaba llenando', () => {
    const form = { ...FORM_VACIO, motivo_consulta: 'cojera' }
    localStorage.setItem(claveBorrador(7), JSON.stringify({ form, guardadoEn: new Date().toISOString(), modo: 'ia' }))
    expect(leerBorrador('7').modo).toBe('ia')
  })

  it('un borrador sin modo (de una versión anterior) se lee sin modo', () => {
    localStorage.setItem(claveBorrador(7), JSON.stringify({ form: FORM_VACIO, guardadoEn: null }))
    expect(leerBorrador('7').modo).toBeNull()
    localStorage.setItem(claveBorrador(7), JSON.stringify({ form: FORM_VACIO, guardadoEn: null, modo: 'otro' }))
    expect(leerBorrador('7').modo).toBeNull()
  })

  it('un formulario sin nada escrito está vacío; con un motivo ya no', () => {
    expect(formularioVacio(FORM_VACIO)).toBe(true)
    expect(formularioVacio({ ...FORM_VACIO, motivo_consulta: 'vómitos' })).toBe(false)
  })
})
