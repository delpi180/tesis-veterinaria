import { describe, it, expect } from 'vitest'
import { agregarSinUbicar } from '@src/utils/historiaClinica'

// Lo que la IA no supo dónde poner pasa a Observaciones: si se pierde en
// silencio, el doctor cree que quedó todo anotado.
describe('agregarSinUbicar', () => {
  it('crea la línea cuando Observaciones está vacío', () => {
    expect(agregarSinUbicar('', ['ceruminolítico', 'DAPP']))
      .toBe('No ubicado por la IA: ceruminolítico, DAPP.')
  })

  it('agrega debajo de lo que ya estaba escrito, sin pisarlo', () => {
    expect(agregarSinUbicar('Dueño llega tarde.', ['pirantel']))
      .toBe('Dueño llega tarde.\nNo ubicado por la IA: pirantel.')
  })

  it('no repite lo que ya está en Observaciones ni los duplicados', () => {
    expect(agregarSinUbicar('Nota: pirantel', ['pirantel'])).toBe('Nota: pirantel')
    expect(agregarSinUbicar('', ['PIF', 'PIF', 'AINEs'])).toBe('No ubicado por la IA: PIF, AINEs.')
  })

  it('tolera lista vacía, vacíos y texto nulo', () => {
    expect(agregarSinUbicar('algo', [])).toBe('algo')
    expect(agregarSinUbicar('', ['  '])).toBe('')
    expect(agregarSinUbicar(undefined, ['PIF'])).toBe('No ubicado por la IA: PIF.')
  })
})
