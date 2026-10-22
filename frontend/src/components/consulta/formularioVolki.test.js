import { describe, it, expect } from 'vitest'
import {
  armarPayloadConsulta, buildPayload, formFromHistoria, formularioVacio,
  normalizarBorrador, ESTADOS_SISTEMA_VOLKI, edadLegible, proximasDosis, ultimoPeso,
} from '@src/utils/historiaClinica'

// El formulario nuevo guarda cuatro cosas que la consulta no tenía: veces al
// día, «a libre demanda», observaciones y productos aplicados. Si el payload las
// pierde, el doctor cree que quedaron anotadas y no es así.
const formBase = () => normalizarBorrador({})

describe('campos nuevos de la consulta estilo Volki', () => {
  it('manda veces al día, observaciones y libre demanda', () => {
    const p = buildPayload({
      ...formBase(), alimentacion_veces_dia: '2', alimentacion_cantidad_gr: '150',
      observaciones: 'Come bien',
    })
    expect(p.alimentacion_veces_dia).toBe(2)
    expect(p.alimentacion_cantidad_gr).toBe(150)
    expect(p.observaciones).toBe('Come bien')
    expect(p.alimentacion_libre_demanda).toBeNull()
  })

  it('a libre demanda no guarda cantidad ni veces al día', () => {
    // Los campos quedan deshabilitados; lo que se escribió antes de marcar no debe colarse
    const p = buildPayload({
      ...formBase(), alimentacion_libre_demanda: true,
      alimentacion_veces_dia: '3', alimentacion_cantidad_gr: '200',
    })
    expect(p.alimentacion_libre_demanda).toBe(true)
    expect(p.alimentacion_veces_dia).toBeNull()
    expect(p.alimentacion_cantidad_gr).toBeNull()
  })

  it('productos aplicados: guarda producto, nombre y cantidad; descarta filas vacías', () => {
    const p = buildPayload({
      ...formBase(),
      productos_aplicados: [
        { producto_id: 7, nombre: ' Suero 500 ml ', cantidad: 2 },
        { producto_id: null, nombre: '', cantidad: 1 },
        { producto_id: 9, nombre: 'Jeringa', cantidad: 0 },
      ],
    })
    expect(p.productos_aplicados).toEqual([{ producto_id: 7, nombre: 'Suero 500 ml', cantidad: 2 }])
  })

  it('sin productos aplicados manda nulo, no una lista vacía', () => {
    expect(buildPayload(formBase()).productos_aplicados).toBeNull()
  })

  it('la consulta nueva (Volki) conserva los campos nuevos', () => {
    const p = armarPayloadConsulta(
      {
        ...formBase(), observaciones: 'Volver en una semana', alimentacion_veces_dia: '2',
        productos_aplicados: [{ producto_id: 1, nombre: 'Suero', cantidad: 1 }],
        antecedentes: 'esto no es de Volki',
      },
      { editando: false, modo: 'manual', inicioMs: 1000, ahoraMs: 61000 },
    )
    expect(p.observaciones).toBe('Volver en una semana')
    expect(p.alimentacion_veces_dia).toBe(2)
    expect(p.productos_aplicados).toHaveLength(1)
    expect(p.antecedentes).toBeNull()
    expect(p.segundos_registro).toBe(60)
    expect(p.metodo_registro).toBe('manual')
  })

  it('al corregir una consulta guardada se vuelve a abrir con los campos nuevos y se mandan de nuevo', () => {
    const f = formFromHistoria({
      id: 5, observaciones: 'Control en 7 días', alimentacion_veces_dia: 3,
      alimentacion_libre_demanda: false,
      productos_aplicados: [{ producto_id: 4, nombre: 'Suero', cantidad: 2 }],
    })
    expect(f.observaciones).toBe('Control en 7 días')
    expect(f.alimentacion_veces_dia).toBe('3')
    expect(f.productos_aplicados).toEqual([{ producto_id: 4, nombre: 'Suero', cantidad: 2 }])
    const p = armarPayloadConsulta(f, { editando: true, modo: null, inicioMs: null })
    expect(p.productos_aplicados).toEqual([{ producto_id: 4, nombre: 'Suero', cantidad: 2 }])
    expect(p.segundos_registro).toBeUndefined()   // corregir no vuelve a medir
  })

  it('un borrador viejo, sin los campos nuevos, se completa solo', () => {
    const f = normalizarBorrador({ motivo_consulta: 'vómitos' })
    expect(f.alimentacion_libre_demanda).toBe(false)
    expect(f.productos_aplicados).toEqual([])
    expect(f.observaciones).toBe('')
  })

  it('marcar libre demanda o agregar un producto cuenta como formulario con algo escrito', () => {
    expect(formularioVacio(formBase())).toBe(true)
    expect(formularioVacio({ ...formBase(), alimentacion_libre_demanda: true })).toBe(false)
    expect(formularioVacio({
      ...formBase(), productos_aplicados: [{ producto_id: 1, nombre: 'Suero', cantidad: 1 }],
    })).toBe(false)
  })
})

describe('estados del examen particular con las palabras de Volki', () => {
  it('cambian los nombres pero no lo que se guarda', () => {
    expect(ESTADOS_SISTEMA_VOLKI.map(o => o.v)).toEqual(['normal', 'alterado', 'no_evaluado'])
    expect(ESTADOS_SISTEMA_VOLKI.map(o => o.l)).toEqual(['Normal', 'Anormal', 'No explorado'])
  })
})

describe('columna derecha del paciente', () => {
  it('la edad sale de la fecha de nacimiento', () => {
    expect(edadLegible({ fecha_nacimiento: '2024-04-10' }, '2026-10-21')).toBe('2 años y 6 meses')
    expect(edadLegible({ fecha_nacimiento: '2026-08-25' }, '2026-10-21')).toBe('1 mes')
  })

  it('sin fecha de nacimiento usa la edad anotada', () => {
    expect(edadLegible({ edad: 4 })).toBe('4 años')
    expect(edadLegible({ edad: 1 })).toBe('1 año')
    expect(edadLegible({})).toBeNull()
  })

  it('el último peso es el de la consulta más reciente que lo tenga', () => {
    const historias = [
      { id: 3, fecha: '2026-10-01T15:00:00Z', peso_kg: null },
      { id: 2, fecha: '2026-09-01T15:00:00Z', peso_kg: '12.3' },
      { id: 1, fecha: '2026-08-01T15:00:00Z', peso_kg: '11.0' },
    ]
    expect(ultimoPeso(historias).kg).toBe('12.3')
    expect(ultimoPeso([{ id: 9, peso_kg: null }])).toBeNull()
  })

  it('solo muestra las próximas dosis con fecha completa y de hoy en adelante, sin repetir', () => {
    const historias = [
      { id: 2, vacunas_items: [{ vacuna: 'Rabia', proxima_dosis: '2026-11-05' }, { vacuna: 'Triple', proxima_dosis: 'En 1 año' }] },
      { id: 1, vacunas_items: [{ vacuna: 'Rabia', proxima_dosis: '2026-11-05' }, { vacuna: 'Vieja', proxima_dosis: '2026-01-01' }] },
    ]
    expect(proximasDosis(historias, '2026-10-21')).toEqual([{ vacuna: 'Rabia', fecha: '2026-11-05' }])
  })
})
