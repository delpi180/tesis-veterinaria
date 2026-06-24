import { describe, it, expect } from 'vitest'
import { estadoStyle, estadoLabel, waRecordatorio } from './citas'

describe('estadoStyle', () => {
  it('debe devolver los estilos de un estado existente', () => {
    const res = estadoStyle('pendiente')
    expect(res.pill).toContain('bg-amber-100')
    expect(res.dot).toContain('bg-amber-500')
  })

  it('debe devolver un estilo por defecto para estados desconocidos', () => {
    const res = estadoStyle('desconocido')
    expect(res.pill).toContain('bg-slate-100')
    expect(res.dot).toContain('bg-slate-400')
  })
})

describe('estadoLabel', () => {
  it('debe capitalizar un estado existente', () => {
    expect(estadoLabel('pendiente')).toBe('Pendiente')
    expect(estadoLabel('confirmada')).toBe('Confirmada')
  })

  it('debe devolver guion para valores vacios', () => {
    expect(estadoLabel(null)).toBe('—')
    expect(estadoLabel('')).toBe('—')
  })
})

describe('waRecordatorio', () => {
  it('debe generar un link de recordatorio generico si no hay cita', () => {
    const url = waRecordatorio('999888777', 'Diana', 'Firulais')
    expect(url).toContain('https://wa.me/51999888777')
    expect(url).toContain(encodeURIComponent('Diana'))
    expect(url).toContain(encodeURIComponent('Firulais'))
    expect(url).toContain(encodeURIComponent('¿Desea agendar una cita?'))
  })

  it('debe generar un link con detalles si hay una cita', () => {
    // Usamos una fecha ISO fija para el test
    const cita = {
      fecha_hora: '2026-07-24T15:00:00',
      motivo: 'Vacuna'
    }
    const url = waRecordatorio('999888777', 'Diana', 'Firulais', cita)
    expect(url).toContain('https://wa.me/51999888777')
    expect(url).toContain(encodeURIComponent('Diana'))
    expect(url).toContain(encodeURIComponent('Firulais'))
    // Validamos que contenga partes clave del recordatorio de la cita agendada
    expect(url).toContain(encodeURIComponent('le recordamos que Firulais tiene una cita'))
    expect(url).toContain(encodeURIComponent('Vacuna'))
  })
})
