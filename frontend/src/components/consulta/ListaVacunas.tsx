import { Alert, Button, Card, Col, Flex, Row, Select, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Campo, ConCampo, EntradaFecha, EntradaTexto } from './campos'
import { LoQueSeOyo } from './ListaTratamientos'
import { VX_EMPTY, fechaBaseISO, sumarDiasISO } from '@src/utils/historiaClinica'
import type { ItemVacuna } from '@src/utils/historiaClinica'

export interface VacunaCatalogo {
  nombre: string
  especie?: string | null
  intervalo_dias?: number | null
  nota?: string | null
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/
const OTRA = '__otra__'

interface Props {
  items: ItemVacuna[]
  onChange: (items: ItemVacuna[]) => void
  catalogo: VacunaCatalogo[]
  especie?: string
  /** Fecha de la consulta: de ahí se propone la próxima dosis. */
  desde?: string
}

/**
 * Vacunas de la consulta.
 *
 * La vacuna se elige del catálogo (lo escrito a mano era la identidad de la
 * vacuna: siete dosis registradas tenían siete nombres distintos, y el
 * consolidado "última dosis de cada vacuna" no agrupaba nada) y la próxima
 * dosis es una FECHA, no texto. El campo aceptaba texto libre y el motor de
 * avisos solo entiende fechas: "En 1 año" —el propio ejemplo que sugería el
 * formulario— nunca generó un recordatorio.
 */
export default function ListaVacunas({ items, onChange, catalogo, especie, desde }: Props) {
  const add = () => onChange([...items, { ...VX_EMPTY }])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i: number, f: keyof ItemVacuna, v: string) => {
    const n = [...items]
    n[i] = { ...n[i], [f]: v }
    onChange(n)
  }

  const esp = (especie || '').toLowerCase()
  const sugeridas = catalogo.filter(v => !v.especie || !esp || esp.startsWith(v.especie))
  const otras = catalogo.filter(v => !sugeridas.includes(v))

  // Al elegir la vacuna se propone la próxima dosis con el intervalo del
  // catálogo. Se puede corregir: es una propuesta, no una imposición.
  const elegir = (i: number, nombre: string) => {
    const entrada = catalogo.find(v => v.nombre === nombre)
    const n = [...items]
    n[i] = { ...n[i], vacuna: nombre }
    if (entrada?.intervalo_dias && !n[i].proxima_dosis) {
      // Se cuenta desde el día de la consulta (o desde hoy en Perú), sin pasar
      // por UTC: desde las 7 pm la propuesta salía un día después.
      n[i].proxima_dosis = sumarDiasISO(fechaBaseISO(desde), entrada.intervalo_dias)
    }
    onChange(n)
  }

  const opciones = [
    ...sugeridas.map(v => ({ value: v.nombre, label: v.nombre })),
    ...(otras.length > 0
      ? [{ label: 'Otras especies', options: otras.map(v => ({ value: v.nombre, label: v.nombre })) }]
      : []),
    { value: OTRA, label: 'Otra (escribir)…' },
  ]

  return (
    <Flex vertical gap={8}>
      {items.map((item, i) => {
        const enCatalogo = catalogo.some(v => v.nombre === item.vacuna)
        const nota = catalogo.find(v => v.nombre === item.vacuna)?.nota
        const proxima = item.proxima_dosis || ''
        const fila = `vacuna ${i + 1}`
        return (
          <Card key={i} size="small">
            <Row gutter={[8, 8]}>
              <Col xs={24} md={9}>
                <Campo label="Vacuna" fila={fila}>
                  <ConCampo>
                    {acc => (
                      <Select
                        {...acc}
                        value={enCatalogo ? item.vacuna : (item.vacuna ? OTRA : undefined)}
                        placeholder="Elegir…" allowClear options={opciones}
                        onChange={(v?: string) => v === OTRA
                          ? update(i, 'vacuna', item.vacuna && !enCatalogo ? item.vacuna : ' ')
                          : elegir(i, v ?? '')}
                        style={{ width: '100%' }}
                      />
                    )}
                  </ConCampo>
                  {/* Lo dictado o lo ya guardado que no está en el catálogo se
                      conserva y se puede corregir a mano; nunca se descarta. */}
                  {item.vacuna && !enCatalogo && (
                    <EntradaTexto
                      value={item.vacuna.trim() === '' ? '' : item.vacuna}
                      onChange={v => update(i, 'vacuna', v)}
                      placeholder="Nombre de la vacuna" ariaLabel={`Nombre de la vacuna, ${fila}`}
                    />
                  )}
                </Campo>
              </Col>
              <Col xs={24} md={7}>
                <Campo label="Lote" fila={fila}>
                  <EntradaTexto value={item.lote ?? ''} onChange={v => update(i, 'lote', v)} placeholder="AB12345" />
                </Campo>
              </Col>
              <Col xs={24} md={8}>
                <Flex align="flex-end" gap={6}>
                  <Campo label="Próxima dosis" fila={fila} style={{ flex: 1 }}>
                    <EntradaFecha
                      tipo="date" value={ES_FECHA.test(proxima) ? proxima : ''}
                      onChange={v => update(i, 'proxima_dosis', v)}
                    />
                  </Campo>
                  <Button
                    type="text" danger icon={<DeleteOutlined />}
                    aria-label={`Quitar ${fila}`} onClick={() => remove(i)}
                  />
                </Flex>
              </Col>
              {/* Lo guardado antes como texto ("En 1 año") no se borra: se muestra
                  para que quien edite la consulta pueda convertirlo en fecha. */}
              {proxima && !ES_FECHA.test(proxima) && (
                <Col span={24}>
                  <Alert
                    type="warning" showIcon
                    title={`Estaba anotado como “${proxima}”: sin una fecha no se puede avisar al dueño.`}
                  />
                </Col>
              )}
              {nota && (
                <Col span={24}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{nota}</Typography.Text>
                </Col>
              )}
              {item.dicho && <Col span={24}><LoQueSeOyo texto={item.dicho} /></Col>}
            </Row>
          </Card>
        )
      })}
      <Button type="dashed" icon={<PlusOutlined />} onClick={add} style={{ alignSelf: 'flex-start' }}>
        Agregar vacuna
      </Button>
    </Flex>
  )
}
