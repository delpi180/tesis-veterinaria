import { describe, it, expect } from 'vitest'
import {
  buildPayload, formularioVacio, normalizarBorrador, esReciente,
} from './HistoriasClinicas'

// Estas funciones deciden qué se guarda en la historia clínica del animal.
// Un número mal convertido acá no rompe nada visible: queda un peso o una
// temperatura equivocada en el registro médico, que es de lo que después se
// dosifica un medicamento.

// `buildPayload` siempre recibe el formulario completo de la pantalla, nunca
// uno parcial: se parte de una base normalizada en vez de inventar objetos a
// medias que la aplicación real no produce.
const formBase = () => normalizarBorrador({})

describe('buildPayload', () => {
  it('convierte los números y respeta los decimales del peso', () => {
    const p = buildPayload({ ...formBase(), peso_kg: '4.5', frecuencia_cardiaca: '120' })
    expect(p.peso_kg).toBe(4.5)
    expect(p.frecuencia_cardiaca).toBe(120)
  })

  it('redondea a entero lo que no admite decimales', () => {
    // Una frecuencia cardiaca de 120.7 no existe; el backend la rechazaría
    const p = buildPayload({ ...formBase(), frecuencia_cardiaca: '120.7' })
    expect(p.frecuencia_cardiaca).toBe(121)
  })

  it('la temperatura conserva su decimal', () => {
    // 39.2 y 39 son cosas distintas en una consulta
    expect(buildPayload({ ...formBase(), temperatura_c: '39.2' }).temperatura_c).toBe(39.2)
  })

  it('los campos vacíos se guardan como nulos, no como cadena vacía', () => {
    const p = buildPayload({ ...formBase(), motivo_consulta: '', peso_kg: '' })
    expect(p.motivo_consulta).toBeNull()
    expect(p.peso_kg).toBeNull()
  })

  it('un número inválido no se guarda como NaN', () => {
    expect(buildPayload({ ...formBase(), peso_kg: 'abc' }).peso_kg).toBeNull()
  })
})

describe('formularioVacio', () => {
  it('reconoce un formulario intacto', () => {
    expect(formularioVacio(formBase())).toBe(true)
  })

  it('detecta que hay algo escrito', () => {
    expect(formularioVacio({ ...formBase(), motivo_consulta: 'Vómitos' })).toBe(false)
  })

  it('un examen particular con algo marcado cuenta como lleno', () => {
    expect(formularioVacio({
      ...formBase(),
      examen_particular: { digestivo: { estado: 'alterado', detalle: '' } },
    })).toBe(false)
  })

  it('un examen particular en blanco no cuenta', () => {
    expect(formularioVacio({
      ...formBase(),
      examen_particular: { digestivo: { estado: '', detalle: '' } },
    })).toBe(true)
  })
})

describe('normalizarBorrador', () => {
  it('completa los campos que le falten a un borrador viejo', () => {
    // Un borrador guardado antes de que existiera `examen_particular` dejaba
    // ese campo sin definir y reventaba la pantalla entera al dibujar los
    // sistemas, con el texto del doctor atrapado adentro.
    const b = normalizarBorrador({ motivo_consulta: 'Control' })
    expect(b.motivo_consulta).toBe('Control')
    expect(b.examen_particular).toBeTypeOf('object')
    expect(b.examen_particular.digestivo).toEqual({ estado: '', detalle: '' })
    expect(Array.isArray(b.tratamiento_items)).toBe(true)
  })

  it('no pisa lo que el borrador sí traía', () => {
    const b = normalizarBorrador({
      examen_particular: { digestivo: { estado: 'alterado', detalle: 'dolor' } },
      tratamiento_items: [{ medicamento: 'Amoxicilina' }],
    })
    expect(b.examen_particular.digestivo.estado).toBe('alterado')
    expect(b.tratamiento_items).toHaveLength(1)
  })

  it('aguanta un borrador corrupto sin explotar', () => {
    const b = normalizarBorrador({ tratamiento_items: 'esto no es una lista' })
    expect(b.tratamiento_items).toEqual([])
  })
})

describe('esReciente', () => {
  it('un borrador de hace un rato se recupera solo', () => {
    expect(esReciente(new Date(Date.now() - 5 * 60_000).toISOString())).toBe(true)
  })

  it('uno de hace días no se toca sin permiso', () => {
    // Es el caso peligroso: texto del lunes reapareciendo el jueves dentro de
    // "Nueva consulta", listo para guardarse como el examen de ese día.
    expect(esReciente(new Date(Date.now() - 3 * 24 * 3600_000).toISOString())).toBe(false)
  })

  it('sin fecha se trata como antiguo', () => {
    expect(esReciente(null)).toBe(false)
  })
})
