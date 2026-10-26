import { Alert, Button, Col, Flex, Input, Row, Typography } from 'antd'
import { AudioOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ItemReceta } from './pdfReceta'
import { BRAND } from '@src/core/color'

const { Text } = Typography

export const ITEM_VACIO: ItemReceta = { medicamento: '', dosis: '', via: '', frecuencia: '', duracion: '' }

type Campo = 'medicamento' | 'dosis' | 'via' | 'frecuencia' | 'duracion'
const CAMPOS: { k: Campo; placeholder: string; span: number }[] = [
  { k: 'medicamento', placeholder: 'Medicamento', span: 8 },
  { k: 'dosis', placeholder: 'Dosis (15 mg/kg)', span: 4 },
  { k: 'via', placeholder: 'Vía (Oral)', span: 4 },
  { k: 'frecuencia', placeholder: 'Frecuencia (c/12h)', span: 4 },
  { k: 'duracion', placeholder: 'Duración (5 días)', span: 4 },
]

export default function ItemsEditor({ items, onChange }: { items: ItemReceta[]; onChange: (items: ItemReceta[]) => void }) {
  const add = () => onChange([...items, { ...ITEM_VACIO }])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i: number, campo: Campo, valor: string) => onChange(items.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it))

  return (
    <Flex vertical gap={8}>
      {items.map((it, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 10, border: `1px solid ${it.en_catalogo === false ? '#e8b04a' : BRAND.border}`,
          background: it.en_catalogo === false ? '#fff8e8' : BRAND.panel,
        }}>
          <Row gutter={[8, 8]}>
            {CAMPOS.map(({ k, placeholder, span }) => (
              <Col key={k} xs={24} sm={span}>
                <Flex gap={4}>
                  <Input value={it[k]} placeholder={placeholder} aria-label={`${placeholder.split(' (')[0]} ${i + 1}`} onChange={e => update(i, k, e.target.value)} />
                  {k === 'duracion' && <Button type="text" danger icon={<DeleteOutlined />} aria-label="Quitar medicamento" onClick={() => remove(i)} />}
                </Flex>
              </Col>
            ))}
          </Row>
          {/* El dictado por voz puede cambiar un número con el ruido de la consulta.
              Con el fragmento original a la vista, el doctor compara la cifra. */}
          {it.dicho && <Text type="secondary" italic style={{ display: 'block', fontSize: 12, marginTop: 6 }}><AudioOutlined /> se oyó: “{it.dicho}”</Text>}
          {/* La IA puede reconocer mal una marca dictada. Si el nombre no coincide con
              ningún producto del inventario se avisa, sin bloquear: recetar algo que la
              clínica no vende es legítimo. */}
          {it.en_catalogo === false && <Alert type="warning" showIcon banner style={{ marginTop: 6, background: 'transparent', padding: 0 }}
            title="No está en tu inventario — revisa que el nombre sea correcto." />}
        </div>
      ))}
      <div><Button type="dashed" icon={<PlusOutlined />} onClick={add}>Agregar medicamento</Button></div>
    </Flex>
  )
}
