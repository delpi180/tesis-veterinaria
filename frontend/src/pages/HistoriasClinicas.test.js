import { describe, it, expect } from 'vitest'
import {
  buildPayload, formularioVacio, normalizarBorrador, esReciente,
} from './HistoriasClinicas'
import {
  armarPayloadConsulta, buscarMedicamento, contarCamposLlenos, describirCuando,
  diasDeDuracion, fechaBaseISO, fechaISOCorta, fechaNumericaPeru, mezclarDatosIA,
  sumarDiasISO,
} from '@src/utils/historiaClinica'

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

// La consulta nueva usa el formulario de Volki: lo que Volki no tiene no puede
// colarse en el registro, venga de un borrador viejo o de lo que entendió la IA.
describe('buildPayload con solo los campos de Volki', () => {
  const lleno = () => ({
    ...formBase(),
    motivo_consulta: 'Vómitos', detalle: 'Desde ayer', peso_kg: '4.5',
    diagnostico_definitivo: 'Gastritis', indicaciones: 'Dieta blanda',
    antecedentes: 'Cirugía previa', tipo_consulta: 'urgencia', tiempo_evolucion: '2 días',
    frecuencia_cardiaca: '120', frecuencia_respiratoria: '22', tllc: 'menor_2s',
    pulso: 'normal', linfonodulos: 'No reactivos',
    diagnostico_presuntivo: 'Gastritis?', diagnosticos_diferenciales: 'Pancreatitis',
    examenes_solicitados: 'Hemograma', pronostico: 'reservado',
    vacunas_items: [{ vacuna: 'Antirrábica', lote: 'A1', proxima_dosis: '2027-10-21' }],
    tratamiento_items: [{ medicamento: 'Omeprazol', dosis: '1 mg/kg' }],
  })

  it('descarta lo que Volki no tiene', () => {
    const p = buildPayload(lleno(), true)
    for (const campo of [
      'antecedentes', 'tipo_consulta', 'tiempo_evolucion', 'frecuencia_cardiaca',
      'frecuencia_respiratoria', 'tllc', 'pulso', 'linfonodulos',
      'diagnostico_presuntivo', 'diagnosticos_diferenciales', 'examenes_solicitados',
      'pronostico', 'vacunas_items',
    ]) expect(p[campo]).toBeNull()
  })

  it('conserva lo que Volki sí tiene', () => {
    const p = buildPayload(lleno(), true)
    expect(p.motivo_consulta).toBe('Vómitos')
    expect(p.detalle).toBe('Desde ayer')
    expect(p.peso_kg).toBe(4.5)
    expect(p.diagnostico_definitivo).toBe('Gastritis')
    expect(p.indicaciones).toBe('Dieta blanda')
    expect(p.tratamiento_items).toHaveLength(1)
  })

  it('sin recortar, el payload sigue completo', () => {
    const p = buildPayload(lleno())
    expect(p.antecedentes).toBe('Cirugía previa')
    expect(p.frecuencia_cardiaca).toBe(120)
    expect(p.vacunas_items).toHaveLength(1)
  })

  it('no modifica el formulario original', () => {
    const f = lleno()
    buildPayload(f, true)
    expect(f.antecedentes).toBe('Cirugía previa')
    expect(f.vacunas_items).toHaveLength(1)
  })
})

// Cómo se arma lo que se guarda: la consulta nueva se recorta y se mide con el
// método que la persona ELIGIÓ al empezar; corregir una guardada no recorta ni mide.
describe('armarPayloadConsulta', () => {
  const lleno = () => ({
    ...formBase(),
    motivo_consulta: 'Vómitos', antecedentes: 'Cirugía previa', frecuencia_cardiaca: '120',
    vacunas_items: [{ vacuna: 'Antirrábica', lote: 'A1', proxima_dosis: '2027-10-21' }],
  })
  const inicio = 1_000_000

  it('consulta nueva: recorta a los campos de Volki', () => {
    const p = armarPayloadConsulta(lleno(), { editando: false, modo: 'manual', inicioMs: inicio, ahoraMs: inicio + 90_000 })
    expect(p.motivo_consulta).toBe('Vómitos')
    expect(p.antecedentes).toBeNull()
    expect(p.frecuencia_cardiaca).toBeNull()
    expect(p.vacunas_items).toBeNull()
  })

  it('el método guardado es el que se eligió, no el que se adivine', () => {
    const manual = armarPayloadConsulta(lleno(), { editando: false, modo: 'manual', inicioMs: inicio, ahoraMs: inicio + 1000 })
    const ia = armarPayloadConsulta(lleno(), { editando: false, modo: 'ia', inicioMs: inicio, ahoraMs: inicio + 1000 })
    expect(manual.metodo_registro).toBe('manual')
    expect(ia.metodo_registro).toBe('ia')
  })

  it('el tiempo cuenta desde que se eligió el modo y nunca baja de 1 segundo', () => {
    const p = armarPayloadConsulta(lleno(), { editando: false, modo: 'ia', inicioMs: inicio, ahoraMs: inicio + 125_400 })
    expect(p.segundos_registro).toBe(125)
    const rapido = armarPayloadConsulta(lleno(), { editando: false, modo: 'ia', inicioMs: inicio, ahoraMs: inicio + 100 })
    expect(rapido.segundos_registro).toBe(1)
  })

  it('sin modo elegido no inventa una medición', () => {
    const p = armarPayloadConsulta(lleno(), { editando: false, modo: null, inicioMs: null })
    expect(p).not.toHaveProperty('segundos_registro')
    expect(p).not.toHaveProperty('metodo_registro')
  })

  it('al corregir una consulta guardada no descarta nada ni la mide de nuevo', () => {
    const p = armarPayloadConsulta(lleno(), { editando: true, modo: null, inicioMs: null })
    expect(p.antecedentes).toBe('Cirugía previa')
    expect(p.frecuencia_cardiaca).toBe(120)
    expect(p.vacunas_items).toHaveLength(1)
    expect(p).not.toHaveProperty('segundos_registro')
    expect(p).not.toHaveProperty('metodo_registro')
  })
})

describe('la IA en una consulta nueva solo llena los campos de Volki', () => {
  const datos = {
    motivo_consulta: 'Vómitos', peso_kg: 4.5, diagnostico_definitivo: 'Gastritis',
    antecedentes: 'Cirugía previa', frecuencia_cardiaca: 120, pronostico: 'reservado',
    diagnostico_presuntivo: 'Gastritis?',
    vacunas_items: [{ vacuna: 'Antirrábica' }],
    tratamiento_items: [{ medicamento: 'Omeprazol', dosis: '1 mg/kg' }],
  }

  it('ignora lo que Volki no tiene', () => {
    const r = mezclarDatosIA(formBase(), datos, [], true)
    expect(r.antecedentes).toBe('')
    expect(r.frecuencia_cardiaca).toBe('')
    expect(r.pronostico).toBe('')
    expect(r.diagnostico_presuntivo).toBe('')
    expect(r.vacunas_items).toEqual([])
  })

  it('llena lo que sí tiene', () => {
    const r = mezclarDatosIA(formBase(), datos, [], true)
    expect(r.motivo_consulta).toBe('Vómitos')
    expect(r.peso_kg).toBe('4.5')
    expect(r.diagnostico_definitivo).toBe('Gastritis')
    expect(r.tratamiento_items).toHaveLength(1)
  })

  it('al corregir una consulta guardada la IA sigue llenando todo', () => {
    const r = mezclarDatosIA(formBase(), datos, [], false)
    expect(r.antecedentes).toBe('Cirugía previa')
    expect(r.frecuencia_cardiaca).toBe('120')
    expect(r.vacunas_items).toHaveLength(1)
  })

  it('el resumen «N campos completados» no cuenta lo que se ignora', () => {
    expect(contarCamposLlenos(datos, true)).toBe(4)   // motivo, peso, diagnóstico, tratamiento
    expect(contarCamposLlenos(datos, false)).toBe(9)
  })
})

describe('fechas en hora de Perú', () => {
  it('suma días sin pasar por zonas horarias', () => {
    expect(sumarDiasISO('2026-10-21', 365)).toBe('2027-10-21')
    expect(sumarDiasISO('2026-12-30', 3)).toBe('2027-01-02')
    expect(sumarDiasISO('2026-10-21T14:30', 0)).toBe('2026-10-21')
  })

  it('toma el día que escribió el doctor, no el de UTC', () => {
    // 8 pm en Lima ya es el día siguiente en UTC: la fecha base no debe correrse
    expect(fechaBaseISO('2026-10-21T20:00')).toBe('2026-10-21')
    expect(fechaBaseISO('')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('muestra la próxima dosis como dd/mm/aaaa y deja el texto viejo tal cual', () => {
    expect(fechaISOCorta('2026-11-05')).toBe('05/11/2026')
    expect(fechaISOCorta('En 1 año')).toBe('En 1 año')
  })

  it('un instante de las 8 pm en Lima cae en su día en Lima', () => {
    // 2026-10-22T01:00Z = 21 de octubre, 8 pm en Lima
    expect(fechaNumericaPeru('2026-10-22T01:00:00Z')).toBe('21/10/2026')
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

describe('medicamentos dictados por la IA', () => {
  const inventario = [
    { id: 1, nombre: 'Metronidazol' },
    { id: 2, nombre: 'Amoxicilina 500 mg' },
    { id: 3, nombre: 'Meloxicam 1 mg' },
    { id: 4, nombre: 'Meloxicam 5 mg' },
  ]

  it('liga el nombre exacto sin importar mayúsculas', () => {
    expect(buscarMedicamento('metronidazol', inventario)).toBe(1)
  })

  it('liga un nombre parecido cuando hay un solo producto', () => {
    expect(buscarMedicamento('Amoxicilina', inventario)).toBe(2)
  })

  it('con dos candidatos o ninguno, no adivina', () => {
    expect(buscarMedicamento('Meloxicam', inventario)).toBeNull()
    expect(buscarMedicamento('Ivermectina', inventario)).toBeNull()
    expect(buscarMedicamento('', inventario)).toBeNull()
  })

  it('propone los días solo cuando el número es claro', () => {
    expect(diasDeDuracion('5 días')).toBe('5')
    expect(diasDeDuracion('por 7 dias')).toBe('7')
    expect(diasDeDuracion('2 semanas')).toBeNull()
    expect(diasDeDuracion('hasta mejorar')).toBeNull()
    expect(diasDeDuracion('3 a 5 días')).toBeNull()
    expect(diasDeDuracion('')).toBeNull()
  })

  it('un medicamento nuevo dictado queda ligado al inventario y con sus días', () => {
    const datos = { tratamiento_items: [{ medicamento: 'Metronidazol', dosis: '15 mg/kg', duracion: '5 días' }] }
    const r = mezclarDatosIA(formBase(), datos, inventario)
    expect(r.tratamiento_items[0]).toMatchObject({ producto_id: 1, duracion_dias: '5', duracion: '5 días' })
  })

  it('sin coincidencia clara queda como estaba: sin producto y sin días', () => {
    const datos = { tratamiento_items: [{ medicamento: 'Ivermectina', duracion: 'hasta mejorar' }] }
    const r = mezclarDatosIA(formBase(), datos, inventario)
    expect(r.tratamiento_items[0].producto_id).toBeNull()
    expect(r.tratamiento_items[0].duracion_dias).toBe('')
  })

  it('no pisa los días que el doctor ya había escrito', () => {
    const prev = formBase()
    prev.tratamiento_items = [{ medicamento: 'Metronidazol', duracion_dias: '10' }]
    const datos = { tratamiento_items: [{ medicamento: 'Metronidazol', duracion: '5 días' }] }
    const r = mezclarDatosIA(prev, datos, inventario)
    expect(r.tratamiento_items[0].duracion_dias).toBe('10')
    expect(r.tratamiento_items[0].producto_id).toBe(1)
  })
})

describe('describirCuando', () => {
  it('muestra la hora de Perú aunque el aparato esté en otra zona', () => {
    // 01:30 UTC del 5 de marzo = 20:30 del 4 de marzo en Lima
    const txt = describirCuando('2020-03-05T01:30:00Z')
    expect(txt).toContain('4 de marzo')
    expect(txt).toContain('20:30')
  })
})
