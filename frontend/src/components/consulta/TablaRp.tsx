/**
 * «Rp./» como en Volki: una tabla con un medicamento por fila (medicamento,
 * dosis, vía, frecuencia y duración) y un botón Agregar. En el celular una
 * tabla con campos dentro no cabe, así que ahí se usa la lista de tarjetas de
 * siempre (`ListaTratamientos`): mismos datos, misma lógica.
 */
import { AutoComplete, Alert, Button, Flex, Grid, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import { EntradaNumero, EntradaTexto } from './campos'
import ListaTratamientos, { LoQueSeOyo } from './ListaTratamientos'
import type { MedicamentoInventario } from './ListaTratamientos'
import { TX_EMPTY, avisosDeTratamiento, fechaISOCorta } from '@src/utils/historiaClinica'
import type { ItemTratamiento } from '@src/utils/historiaClinica'

interface Props {
  items: ItemTratamiento[]
  onChange: (items: ItemTratamiento[]) => void
  /** Fecha de la consulta: de ahí se cuenta cuándo termina cada tratamiento. */
  desde?: string
  medicamentos?: MedicamentoInventario[]
}

export default function TablaRp({ items, onChange, desde, medicamentos = [] }: Props) {
  const pantallas = Grid.useBreakpoint()
  if (!pantallas.md) {
    return <ListaTratamientos items={items} onChange={onChange} desde={desde} medicamentos={medicamentos} />
  }

  const agregar = () => onChange([...items, { ...TX_EMPTY }])
  const quitar = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const cambiar = (i: number, campo: keyof ItemTratamiento, valor: string) => {
    const n = [...items]
    n[i] = { ...n[i], [campo]: valor }
    onChange(n)
  }
  // Mismo enlace con el inventario que en la lista de tarjetas
  const escribirMedicamento = (i: number, texto: string) => {
    const encontrado = medicamentos.find(p => p.nombre.toLowerCase() === texto.trim().toLowerCase())
    const n = [...items]
    n[i] = { ...n[i], medicamento: texto, producto_id: encontrado ? encontrado.id : null }
    onChange(n)
  }

  const nombreFila = (i: number) => `medicamento ${i + 1}`

  const columnas: TableColumnsType<ItemTratamiento & { _i: number }> = [
    {
      title: 'Medicamento', dataIndex: 'medicamento', width: '28%',
      render: (_v, item) => (
        <ConCampoFila etiqueta="Medicamento" fila={nombreFila(item._i)}>
          {acc => (
            <AutoComplete
              {...acc}
              value={item.medicamento}
              onChange={(texto: string) => escribirMedicamento(item._i, texto ?? '')}
              placeholder="Metronidazol"
              options={medicamentos.map(m => ({ value: m.nombre }))}
              filterOption={(entrada, op) => (op?.value ?? '').toLowerCase().includes(entrada.toLowerCase())}
              style={{ width: '100%' }}
            />
          )}
        </ConCampoFila>
      ),
    },
    {
      title: 'Dosis', dataIndex: 'dosis', width: '14%',
      render: (_v, item) => (
        <EntradaTexto
          value={item.dosis ?? ''} onChange={v => cambiar(item._i, 'dosis', v)}
          placeholder="15 mg/kg" ariaLabel={`Dosis, ${nombreFila(item._i)}`}
        />
      ),
    },
    {
      title: 'Vía', dataIndex: 'via', width: '12%',
      render: (_v, item) => (
        <EntradaTexto
          value={item.via ?? ''} onChange={v => cambiar(item._i, 'via', v)}
          placeholder="Oral" ariaLabel={`Vía, ${nombreFila(item._i)}`}
        />
      ),
    },
    {
      title: 'Frecuencia', dataIndex: 'frecuencia', width: '14%',
      render: (_v, item) => (
        <EntradaTexto
          value={item.frecuencia ?? ''} onChange={v => cambiar(item._i, 'frecuencia', v)}
          placeholder="c/12h" ariaLabel={`Frecuencia, ${nombreFila(item._i)}`}
        />
      ),
    },
    {
      // Duración en DÍAS (no texto libre): con eso se calcula cuándo termina el tratamiento
      title: 'Duración (días)', dataIndex: 'duracion_dias', width: '14%',
      render: (_v, item) => (
        <EntradaNumero
          value={String(item.duracion_dias ?? '')} onChange={v => cambiar(item._i, 'duracion_dias', v)}
          step="1" min={1} max={365} placeholder="5" ariaLabel={`Duración en días, ${nombreFila(item._i)}`}
        />
      ),
    },
    {
      title: '', key: 'quitar', width: 48, align: 'center',
      render: (_v, item) => (
        <Button
          type="text" danger icon={<DeleteOutlined />}
          aria-label={`Quitar ${nombreFila(item._i)}`} onClick={() => quitar(item._i)}
        />
      ),
    },
  ]

  return (
    <Flex vertical gap={8}>
      <Table
        size="small" pagination={false} rowKey="_i"
        columns={columnas}
        dataSource={items.map((it, _i) => ({ ...it, _i }))}
        locale={{ emptyText: 'No hay medicamentos. Pulsa «Agregar».' }}
        // Debajo de cada fila: lo que hay que avisar (stock, vencimiento, cuándo termina, lo que se oyó)
        expandable={{
          showExpandColumn: false,
          expandedRowKeys: items.flatMap((it, i) => {
            const a = avisosDeTratamiento(it, medicamentos, desde)
            return a.p || a.termina || it.dicho ? [i] : []
          }),
          expandedRowRender: item => {
            const { p, vencido, sinStock, termina } = avisosDeTratamiento(item, medicamentos, desde)
            return (
              <Flex vertical gap={4}>
                {p && !vencido && !sinStock && (
                  <Typography.Text type="success" style={{ fontSize: 12 }}>
                    En inventario · {p.stock} {p.unidad || 'u'} disponible{p.stock === 1 ? '' : 's'}
                  </Typography.Text>
                )}
                {p && (vencido || sinStock) && (
                  // Avisa, no bloquea: el doctor puede indicarlo igual y que el dueño lo compre afuera
                  <Alert
                    type="warning" showIcon
                    title={vencido
                      ? `Ojo: el lote de ${p.nombre} venció el ${fechaISOCorta(p.fecha_vencimiento!)}. No se podrá entregar.`
                      : `Ojo: no queda stock de ${p.nombre} en la clínica.`}
                  />
                )}
                {termina && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Termina el <strong>{termina}</strong>
                    {item.duracion ? <> · antes decía “{item.duracion}”</> : null}
                  </Typography.Text>
                )}
                {item.dicho && <LoQueSeOyo texto={item.dicho} />}
              </Flex>
            )
          },
        }}
      />
      <Button icon={<PlusOutlined />} onClick={agregar} style={{ alignSelf: 'flex-start' }}>
        Agregar
      </Button>
    </Flex>
  )
}

/** Nombre accesible para un control de antd dentro de una celda: «Medicamento, medicamento 2». */
function ConCampoFila({ etiqueta, fila, children }: {
  etiqueta: string
  fila: string
  children: (acc: { 'aria-label': string }) => ReactNode
}) {
  return <>{children({ 'aria-label': `${etiqueta}, ${fila}` })}</>
}
