import { describe, it, expect } from 'vitest'
import { avisosDeSuscripcion, textoTope } from './suscripcion'

const base = (extra = {}) => ({
  estado: 'activa', dias_restantes: 30,
  limites: {
    usuarios: { uso: 1, limite: 3, porcentaje: 33 },
    mascotas: { uso: 10, limite: 1500, porcentaje: 1 },
    almacenamiento: { uso: 5, limite: 1000, porcentaje: 1, unidad: 'MB' },
    ia: { uso: 0, limite: 300, porcentaje: 0 },
  },
  ...extra,
})

describe('avisos de suscripción', () => {
  it('sin motivo, no avisa', () => {
    expect(avisosDeSuscripcion(base())).toEqual([])
    expect(avisosDeSuscripcion(null)).toEqual([])
  })

  it('avisa cuando el plan está por vencer, y es urgente en los últimos 2 días', () => {
    expect(avisosDeSuscripcion(base({ dias_restantes: 6 }))[0]).toMatchObject({ nivel: 'aviso', texto: 'Tu plan vence en 6 días.' })
    expect(avisosDeSuscripcion(base({ dias_restantes: 1 }))[0]).toMatchObject({ nivel: 'urgente', texto: 'Tu plan vence en 1 día.' })
    expect(avisosDeSuscripcion(base({ dias_restantes: 0 }))[0].texto).toBe('Tu plan vence hoy.')
  })

  it('un plan sin vencimiento no avisa', () => {
    expect(avisosDeSuscripcion(base({ dias_restantes: null }))).toEqual([])
  })

  it('avisa al acercarse a un tope y es urgente al llegar', () => {
    const cerca = base({ limites: { usuarios: { uso: 9, limite: 10, porcentaje: 90 } } })
    expect(avisosDeSuscripcion(cerca)[0]).toMatchObject({ nivel: 'aviso', clave: 'usuarios' })
    const tope = base({ limites: { usuarios: { uso: 3, limite: 3, porcentaje: 100 } } })
    expect(avisosDeSuscripcion(tope)[0]).toMatchObject({ nivel: 'urgente', texto: 'Llegaste al tope de usuarios de tu plan.' })
  })

  it('lo urgente va primero', () => {
    const s = base({
      dias_restantes: 5,
      limites: { ia: { uso: 300, limite: 300, porcentaje: 100 }, usuarios: { uso: 9, limite: 10, porcentaje: 90 } },
    })
    expect(avisosDeSuscripcion(s).map(a => a.nivel)).toEqual(['urgente', 'aviso', 'aviso'])
  })

  it('un recurso ilimitado no avisa nunca', () => {
    expect(avisosDeSuscripcion(base({ limites: { usuarios: { uso: 500, limite: null, porcentaje: null } } }))).toEqual([])
  })

  it('los topes se escriben en palabras', () => {
    expect(textoTope(null)).toBe('Sin límite')
    expect(textoTope(3)).toBe('3')
    expect(textoTope(1000, 'MB')).toMatch(/MB/)
  })
})
