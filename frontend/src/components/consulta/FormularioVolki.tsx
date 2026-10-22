/**
 * Formulario de consulta NUEVA, armado como el de Volki: una sola página con
 * «Detalle de consulta», paneles desplegables (Alimentación, Examen objetivo
 * general, Examen objetivo particular, Tratamiento/Indicaciones), la tabla
 * «Rp./» y la de «Productos aplicados». Los modos Escribir y Dictar usan este
 * mismo formulario; solo cambia cómo se llena.
 *
 * Corregir una consulta ya guardada NO pasa por aquí: usa `Secciones`, que
 * muestra todos los campos clínicos.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Card, Checkbox, Col, Collapse, Flex, Radio, Row, Typography, theme } from 'antd'
import { Campo, AreaTexto, EntradaFecha, EntradaNumero, EntradaTexto, Selector } from './campos'
import type { Resaltado } from './campos'
import TablaRp from './TablaRp'
import type { MedicamentoInventario } from './ListaTratamientos'
import TablaProductos from './TablaProductos'
import type { ProductoInventario } from './TablaProductos'
import {
  ESTADOS_SISTEMA_VOLKI, OPT, SISTEMAS_EOP, SISTEMA_LABELS, toLocalDatetimeString,
} from '@src/utils/historiaClinica'
import type {
  CampoTexto, FormConsulta, ItemProductoAplicado, ItemTratamiento,
} from '@src/utils/historiaClinica'

type Panel = 'alimentacion' | 'eog' | 'eop' | 'tratamiento'
const GRUPO_EXAMEN: Panel[] = ['alimentacion', 'eog', 'eop']
const GRUPO_TRATAMIENTO: Panel[] = ['tratamiento']

/** Campos que pertenecen a cada panel: sirven para abrir solos los que la IA acaba de llenar. */
const CAMPOS_PANEL: Record<Panel, CampoTexto[]> = {
  alimentacion: ['alimentacion_tipo', 'alimentacion_cantidad_gr', 'alimentacion_veces_dia'],
  eog: ['mucosas', 'temperatura_c', 'peso_kg', 'condicion_corporal', 'estado_sensorio', 'hidratacion'],
  eop: [],
  tratamiento: ['indicaciones'],
}

interface Props {
  form: FormConsulta
  resaltados: Record<string, Resaltado>
  set: (campo: CampoTexto, valor: string) => void
  setEop: (sistema: string, campo: 'estado' | 'detalle', valor: string) => void
  setLibreDemanda: (valor: boolean) => void
  setTratamientos: (items: ItemTratamiento[]) => void
  setProductosAplicados: (items: ItemProductoAplicado[]) => void
  medicamentos: MedicamentoInventario[]
  productos: ProductoInventario[]
  /** Sube cada vez que la IA llena el formulario: abre los paneles que recibieron datos. */
  senalIA: number
  /** Los botones del pie (Cancelar y Guardar) los pone la pantalla. */
  children?: ReactNode
}

function tieneDatos(form: FormConsulta, panel: Panel): boolean {
  if (panel === 'eop') return Object.values(form.examen_particular).some(x => x.estado || x.detalle)
  if (panel === 'tratamiento') return !!form.indicaciones.trim() || form.tratamiento_items.some(i => i.medicamento.trim())
  if (panel === 'alimentacion' && form.alimentacion_libre_demanda) return true
  return CAMPOS_PANEL[panel].some(c => !!form[c])
}

export default function FormularioVolki({
  form, resaltados: hl, set, setEop, setLibreDemanda, setTratamientos, setProductosAplicados,
  medicamentos, productos, senalIA, children,
}: Props) {
  const { token } = theme.useToken()
  const [abiertos, setAbiertos] = useState<Panel[]>([])
  const [senalVista, setSenalVista] = useState(senalIA)
  // Cuando la IA acaba de llenar el formulario, se abren los paneles con datos
  // para que el doctor los revise sin buscarlos. (Ajuste durante el dibujo, sin efecto.)
  if (senalIA !== senalVista) {
    setSenalVista(senalIA)
    const conDatos = (Object.keys(CAMPOS_PANEL) as Panel[]).filter(p => tieneDatos(form, p))
    setAbiertos(a => Array.from(new Set([...a, ...conDatos])))
  }

  const alCambiar = (grupo: Panel[]) => (claves: string | string[]) =>
    setAbiertos(a => [
      ...a.filter(p => !grupo.includes(p)),
      ...(Array.isArray(claves) ? claves : [claves]) as Panel[],
    ])

  const maxFecha = toLocalDatetimeString(new Date().toISOString())
  const libre = form.alimentacion_libre_demanda

  const panelAlimentacion = {
    key: 'alimentacion', label: 'Alimentación',
    children: (
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12} xxl={8}>
          <Campo label="Tipo" hl={hl.alimentacion_tipo}>
            <EntradaTexto
              value={form.alimentacion_tipo} onChange={v => set('alimentacion_tipo', v)}
              placeholder="Balanceado / BARF / mixto" hl={hl.alimentacion_tipo}
            />
          </Campo>
        </Col>
        <Col xs={24} md={12} xxl={8}>
          <Flex align="flex-end" style={{ height: '100%' }}>
            <Checkbox checked={libre} onChange={e => setLibreDemanda(e.target.checked)}>
              A libre demanda
            </Checkbox>
          </Flex>
        </Col>
        <Col xs={12} md={12} xxl={4}>
          <Campo label="Cantidad (gr.)" hl={hl.alimentacion_cantidad_gr}>
            <EntradaNumero
              value={libre ? '' : form.alimentacion_cantidad_gr} onChange={v => set('alimentacion_cantidad_gr', v)}
              placeholder="200" hl={hl.alimentacion_cantidad_gr} step="1" disabled={libre}
            />
          </Campo>
        </Col>
        <Col xs={12} md={12} xxl={4}>
          <Campo label="Veces al día" hl={hl.alimentacion_veces_dia}>
            <EntradaNumero
              value={libre ? '' : form.alimentacion_veces_dia} onChange={v => set('alimentacion_veces_dia', v)}
              placeholder="2" hl={hl.alimentacion_veces_dia} step="1" min={1} max={50} disabled={libre}
            />
          </Campo>
        </Col>
      </Row>
    ),
  }

  const panelEog = {
    key: 'eog', label: 'Examen objetivo general',
    children: (
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12} xxl={8}>
          <Campo label="Mucosas" hl={hl.mucosas}>
            <Selector value={form.mucosas} onChange={v => set('mucosas', v)} opciones={OPT.mucosas} hl={hl.mucosas} />
          </Campo>
        </Col>
        <Col xs={12} md={12} xxl={8}>
          <Campo label="Temperatura (°C)" hl={hl.temperatura_c}>
            <EntradaNumero value={form.temperatura_c} onChange={v => set('temperatura_c', v)} placeholder="38.5" hl={hl.temperatura_c} />
          </Campo>
        </Col>
        <Col xs={12} md={12} xxl={8}>
          <Campo label="Peso (kg)" hl={hl.peso_kg}>
            <EntradaNumero value={form.peso_kg} onChange={v => set('peso_kg', v)} placeholder="5.0" hl={hl.peso_kg} />
          </Campo>
        </Col>
        <Col xs={12} md={12} xxl={8}>
          <Campo label="Condición corporal (1–9)" hl={hl.condicion_corporal}>
            <EntradaNumero value={form.condicion_corporal} onChange={v => set('condicion_corporal', v)} placeholder="5" hl={hl.condicion_corporal} step="1" min={1} max={9} />
          </Campo>
        </Col>
        <Col xs={12} md={12} xxl={8}>
          <Campo label="Estado del sensorio" hl={hl.estado_sensorio}>
            <Selector value={form.estado_sensorio} onChange={v => set('estado_sensorio', v)} opciones={OPT.estado_sensorio} hl={hl.estado_sensorio} />
          </Campo>
        </Col>
        <Col xs={24} md={12} xxl={8}>
          <Campo label="Hidratación" hl={hl.hidratacion}>
            <Selector value={form.hidratacion} onChange={v => set('hidratacion', v)} opciones={OPT.hidratacion} hl={hl.hidratacion} />
          </Campo>
        </Col>
      </Row>
    ),
  }

  const panelEop = {
    key: 'eop', label: 'Examen objetivo particular',
    children: (
      <Row gutter={[16, 14]}>
        {SISTEMAS_EOP.map(s => (
          <Col key={s} xs={24} md={12} xxl={8}>
            <Flex vertical gap={6}>
              <Campo label={SISTEMA_LABELS[s]}>
                <EntradaTexto
                  value={form.examen_particular[s].detalle} onChange={v => setEop(s, 'detalle', v)}
                  placeholder="Observaciones…"
                />
              </Campo>
              <Radio.Group
                value={form.examen_particular[s].estado || undefined}
                onChange={e => setEop(s, 'estado', e.target.value)}
                aria-label={`Estado, ${SISTEMA_LABELS[s]}`}
                optionType="button" buttonStyle="solid" size="middle"
                options={ESTADOS_SISTEMA_VOLKI.map(o => ({ value: o.v, label: o.l }))}
              />
            </Flex>
          </Col>
        ))}
      </Row>
    ),
  }

  const panelTratamiento = {
    key: 'tratamiento', label: 'Tratamiento/Indicaciones',
    children: (
      <Flex vertical gap={14}>
        <Campo label="Indicaciones" hl={hl.indicaciones}>
          <AreaTexto
            value={form.indicaciones} onChange={v => set('indicaciones', v)} filas={2}
            placeholder="Dieta blanda 3 días, reposo…" hl={hl.indicaciones}
          />
        </Campo>
        <Flex vertical gap={6}>
          <Typography.Text strong>Rp./</Typography.Text>
          <TablaRp
            items={form.tratamiento_items} desde={form.fecha || undefined}
            medicamentos={medicamentos} onChange={setTratamientos}
          />
        </Flex>
      </Flex>
    ),
  }

  return (
    <Card title="Detalle de consulta" styles={{ body: { padding: 16 } }}>
      <Flex vertical gap={14}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12} xxl={6}>
            <Campo label="Fecha">
              <EntradaFecha value={form.fecha} onChange={v => set('fecha', v)} max={maxFecha} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Vacía = ahora. Si pasas una consulta de papel, pon el día y la hora en que se atendió.
              </Typography.Text>
            </Campo>
          </Col>
          <Col xs={24} md={12} xxl={6}>
            <Campo label="Derivado por" hl={hl.derivado_por}>
              <EntradaTexto
                value={form.derivado_por} onChange={v => set('derivado_por', v)}
                placeholder="Colega / clínica" hl={hl.derivado_por}
              />
            </Campo>
          </Col>
          {/* En pantallas anchas el motivo comparte fila con la fecha, en vez de estirarse solo */}
          <Col xs={24} xxl={12}>
            <Campo label="Motivo" hl={hl.motivo_consulta}>
              <AreaTexto
                value={form.motivo_consulta} onChange={v => set('motivo_consulta', v)} filas={1}
                placeholder="Motivo principal de la consulta" hl={hl.motivo_consulta}
              />
            </Campo>
          </Col>
        </Row>
        <Campo label="Anamnesis" hl={hl.detalle}>
          <AreaTexto value={form.detalle} onChange={v => set('detalle', v)} filas={3} hl={hl.detalle} />
        </Campo>

        <Collapse
          activeKey={abiertos.filter(p => GRUPO_EXAMEN.includes(p))}
          onChange={alCambiar(GRUPO_EXAMEN)}
          items={[panelAlimentacion, panelEog, panelEop]}
        />

        <Campo label="Diagnóstico" hl={hl.diagnostico_definitivo}>
          <AreaTexto
            value={form.diagnostico_definitivo} onChange={v => set('diagnostico_definitivo', v)}
            filas={2} hl={hl.diagnostico_definitivo}
          />
        </Campo>

        <Collapse
          activeKey={abiertos.filter(p => GRUPO_TRATAMIENTO.includes(p))}
          onChange={alCambiar(GRUPO_TRATAMIENTO)}
          items={[panelTratamiento]}
        />

        <Row gutter={[12, 12]}>
          <Col xs={24} md={14}>
            <Campo label="Observaciones" hl={hl.observaciones}>
              <AreaTexto value={form.observaciones} onChange={v => set('observaciones', v)} filas={2} hl={hl.observaciones} />
            </Campo>
          </Col>
          <Col xs={24} md={10}>
            <Campo label="Próximo control">
              <EntradaFecha value={form.proxima_cita} onChange={v => set('proxima_cita', v)} />
            </Campo>
          </Col>
        </Row>

        <Flex vertical gap={8} style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>Productos aplicados</Typography.Title>
          <TablaProductos items={form.productos_aplicados} onChange={setProductosAplicados} productos={productos} />
        </Flex>

        {children}
      </Flex>
    </Card>
  )
}
