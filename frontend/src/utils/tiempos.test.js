import { describe, it, expect } from 'vitest'
import { tiemposDeRegistro, sumarDictado } from './tiempos'

describe('tiempo de registro', () => {
  it('manual: desde que se abrió hasta guardar', () => {
    expect(tiemposDeRegistro({ usoIA: false, ia: { grabacion: 0, procesamiento: 0 }, inicioMs: 0, ahoraMs: 125000 }))
      .toEqual({ metodo_registro: 'manual', segundos_registro: 125 })
  })
  it('IA: grabación + procesamiento, sin contar la revisión', () => {
    const r = tiemposDeRegistro({ usoIA: true, ia: { grabacion: 70, procesamiento: 12 }, inicioMs: 0, ahoraMs: 900000 })
    expect(r).toEqual({ metodo_registro: 'ia', segundos_grabacion: 70, segundos_procesamiento: 12, segundos_registro: 82 })
  })
  it('acumula varios dictados de la misma consulta', () => {
    let a = { grabacion: 0, procesamiento: 0 }
    a = sumarDictado(a, { grabacion_seg: 30, procesamiento_seg: 8 })
    a = sumarDictado(a, { grabacion_seg: 0, procesamiento_seg: 6 })   // reintento
    expect(a).toEqual({ grabacion: 30, procesamiento: 14 })
  })
})
