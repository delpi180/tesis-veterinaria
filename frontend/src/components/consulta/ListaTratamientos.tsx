import { AutoComplete, Alert, Button, Card, Col, Flex, Row, Typography } from 'antd'
import { AudioOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Campo, ConCampo, EntradaNumero, EntradaTexto } from './campos'
import { TX_EMPTY, avisosDeTratamiento, fechaISOCorta } from '@src/utils/historiaClinica'
import type { ItemTratamiento } from '@src/utils/historiaClinica'

export interface MedicamentoInventario {
  id: number
  nombre: string
  stock?: number | null
  unidad?: string | null
  fecha_vencimiento?: string | null
}

/** Lo que el sistema oyó para esta línea.
 *
 *  El reconocimiento de voz falla con ruido de consulta y a veces cambia un
 *  número ("cuatro" → "dos"). Eso no se puede eliminar del todo, pero sí se
 *  puede dejar a la vista: con el fragmento original al lado, el doctor
 *  compara la cifra de un vistazo en vez de confiar a ciegas en el campo.
 *  Solo aparece en lo que acaba de dictar; al reabrir la consulta ya no.
 */
export function LoQueSeOyo({ texto }: { texto?: string }) {
  if (!texto) return null
  return (
    <Typography.Text type="secondary" italic style={{ fontSize: 12 }}>
      <AudioOutlined /> se oyó: “{texto}”
    </Typography.Text>
  )
}

interface Props {
  items: ItemTratamiento[]
  onChange: (items: ItemTratamiento[]) => void
  /** Fecha de la consulta: de ahí se cuenta cuándo termina cada tratamiento. */
  desde?: string
  medicamentos?: MedicamentoInventario[]
}

export default function ListaTratamientos({ items, onChange, desde, medicamentos = [] }: Props) {
  const add = () => onChange([...items, { ...TX_EMPTY }])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i: number, f: keyof ItemTratamiento, v: string) => {
    const n = [...items]
    n[i] = { ...n[i], [f]: v }
    onChange(n)
  }

  // Al escribir el medicamento se busca en el inventario de la clínica. Si
  // coincide, queda enlazado al producto: así se puede avisar del vencimiento
  // aquí mismo y saber después si el dueño llegó a llevárselo. Si no coincide,
  // no pasa nada: se receta lo que el animal necesita, no solo lo que hay en
  // el estante.
  const escribirMedicamento = (i: number, texto: string) => {
    const encontrado = medicamentos.find(
      p => p.nombre.toLowerCase() === texto.trim().toLowerCase())
    const n = [...items]
    n[i] = { ...n[i], medicamento: texto, producto_id: encontrado ? encontrado.id : null }
    onChange(n)
  }
  return (
    <Flex vertical gap={8}>
      {items.map((item, i) => {
        const { p, vencido, sinStock, termina } = avisosDeTratamiento(item, medicamentos, desde)
        const fila = `medicamento ${i + 1}`
        return (
          <Card key={i} size="small">
            <Row gutter={[8, 8]}>
              <Col xs={24} md={7}>
                <Campo label="Medicamento" fila={fila}>
                  <ConCampo>
                    {acc => (
                      <AutoComplete
                        {...acc}
                        value={item.medicamento}
                        onChange={(texto: string) => escribirMedicamento(i, texto ?? '')}
                        placeholder="Metronidazol"
                        options={medicamentos.map(m => ({ value: m.nombre }))}
                        filterOption={(entrada, op) => (op?.value ?? '').toLowerCase().includes(entrada.toLowerCase())}
                        style={{ width: '100%' }}
                      />
                    )}
                  </ConCampo>
                </Campo>
              </Col>
              <Col xs={12} md={4}>
                <Campo label="Dosis" fila={fila}>
                  <EntradaTexto value={item.dosis ?? ''} onChange={v => update(i, 'dosis', v)} placeholder="15 mg/kg" />
                </Campo>
              </Col>
              <Col xs={12} md={4}>
                <Campo label="Vía" fila={fila}>
                  <EntradaTexto value={item.via ?? ''} onChange={v => update(i, 'via', v)} placeholder="Oral" />
                </Campo>
              </Col>
              <Col xs={12} md={4}>
                <Campo label="Frecuencia" fila={fila}>
                  <EntradaTexto value={item.frecuencia ?? ''} onChange={v => update(i, 'frecuencia', v)} placeholder="c/12h" />
                </Campo>
              </Col>
              <Col xs={12} md={5}>
                {/* Duración en DÍAS, no en texto libre.
                    Con "5 días", "cinco días" o "unos días" no hay forma de
                    calcular cuándo termina el tratamiento, y sin eso no existe
                    control: no se puede saber qué termina hoy ni quién lo dejó a
                    medias. En la base real, 37 de 39 ítems no tenían duración y
                    los otros dos estaban escritos a mano. */}
                <Flex align="flex-end" gap={6}>
                  <Campo label="Duración (días)" fila={fila} style={{ flex: 1 }}>
                    <EntradaNumero
                      value={String(item.duracion_dias ?? '')} onChange={v => update(i, 'duracion_dias', v)}
                      step="1" min={1} max={365} placeholder="5"
                    />
                  </Campo>
                  <Button
                    type="text" danger icon={<DeleteOutlined />}
                    aria-label={`Quitar ${fila}`} onClick={() => remove(i)}
                  />
                </Flex>
              </Col>
              {p && !vencido && !sinStock && (
                <Col span={24}>
                  <Typography.Text type="success" style={{ fontSize: 12 }}>
                    En inventario · {p.stock} {p.unidad || 'u'} disponible{p.stock === 1 ? '' : 's'}
                  </Typography.Text>
                </Col>
              )}
              {p && (vencido || sinStock) && (
                <Col span={24}>
                  {/* Avisa, no bloquea: el doctor puede indicarlo igual y que el
                      dueño lo compre afuera. Lo que no puede pasar es que nadie se
                      entere hasta que el cliente está en el mostrador. */}
                  <Alert
                    type="warning" showIcon
                    title={vencido
                      ? `Ojo: el lote de ${p.nombre} venció el ${fechaISOCorta(p.fecha_vencimiento!)}. No se podrá entregar.`
                      : `Ojo: no queda stock de ${p.nombre} en la clínica.`}
                  />
                </Col>
              )}
              {termina && (
                <Col span={24}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Termina el <strong>{termina}</strong>
                    {item.duracion ? <> · antes decía “{item.duracion}”</> : null}
                  </Typography.Text>
                </Col>
              )}
              {item.dicho && <Col span={24}><LoQueSeOyo texto={item.dicho} /></Col>}
            </Row>
          </Card>
        )
      })}
      <Button type="dashed" icon={<PlusOutlined />} onClick={add} style={{ alignSelf: 'flex-start' }}>
        Agregar medicamento
      </Button>
    </Flex>
  )
}
