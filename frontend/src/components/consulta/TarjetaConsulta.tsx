import type { ReactNode } from 'react'
import { Button, Card, Divider, Flex, Tag, Typography, theme } from 'antd'
import { PaperClipOutlined } from '@ant-design/icons'
import {
  SISTEMAS_EOP, SISTEMA_LABELS, fechaHoraPeru, fechaISOCorta, fechaNumericaPeru, fechaPeru, getLabel,
} from '@src/utils/historiaClinica'
import type { Historia } from '@src/utils/historiaClinica'

function Fila({ label, value }: { label: string; value?: ReactNode }) {
  if (value === null || value === undefined || value === '' || value === false) return null
  return (
    <Flex gap={8} align="baseline">
      <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', minWidth: 88, flexShrink: 0 }}>
        {label}
      </Typography.Text>
      <span>{value}</span>
    </Flex>
  )
}

function Bloque({ titulo, mostrar, children }: { titulo: string; mostrar: unknown; children: ReactNode }) {
  if (!mostrar) return null
  return (
    <div>
      <Divider titlePlacement="start" plain style={{ margin: '8px 0' }}>
        <Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase' }}>{titulo}</Typography.Text>
      </Divider>
      <Flex vertical gap={2}>{children}</Flex>
    </div>
  )
}

interface Props {
  h: Historia
  onEdit: (h: Historia) => void
  onDelete: (h: Historia) => void
}

/** Una consulta ya guardada, de solo lectura, con sus botones de editar y eliminar. */
export default function TarjetaConsulta({ h, onEdit, onDelete }: Props) {
  const { token } = theme.useToken()
  const fecha = fechaHoraPeru(h.fecha || h.creado_en as string)
  // Una consulta digitalizada después (o con la fecha corregida) deja ver
  // cuándo se atendió y cuándo se cargó: son dos datos distintos del registro.
  const cargada = h.creado_en ? new Date(h.creado_en) : null
  const atendida = new Date(h.fecha || h.creado_en as string)
  const registradaDespues =
    cargada && Math.abs(cargada.getTime() - atendida.getTime()) > 24 * 60 * 60 * 1000
      ? fechaPeru(cargada)
      : null
  const txItems = Array.isArray(h.tratamiento_items) ? h.tratamiento_items : []
  const vxItems = Array.isArray(h.vacunas_items) ? h.vacunas_items : []
  const epEntries = SISTEMAS_EOP.map(s => {
    const val = (h.examen_particular || {})[s]
    if (!val) return null
    const texto = typeof val === 'string'
      ? val
      : [val.estado ? getLabel('sistema_estado', val.estado) : null, val.detalle].filter(Boolean).join(' — ')
    return texto ? { label: SISTEMA_LABELS[s], texto } : null
  }).filter((e): e is { label: string; texto: string } => !!e)

  return (
    <Card
      size="small"
      styles={{
        // En el celular el título y los botones bajan de línea en vez de apretarse
        header: { background: token.colorPrimary, color: token.colorTextLightSolid, flexWrap: 'wrap', gap: 8, paddingBlock: 8 },
        body: { paddingTop: 4 },
      }}
      title={
        <Flex align="baseline" gap={8} wrap>
          <span>{fecha}</span>
          {registradaDespues && (
            <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>registrada el {registradaDespues}</span>
          )}
        </Flex>
      }
      extra={
        <Flex align="center" gap={8} wrap justify="flex-end">
          {h.tipo_consulta && <Tag bordered={false} style={{ margin: 0 }}>{getLabel('tipo_consulta', h.tipo_consulta)}</Tag>}
          {h.documentos_count > 0 && (
            <Tag bordered={false} style={{ margin: 0 }} title="Archivos adjuntos a esta consulta">
              <PaperClipOutlined /> {h.documentos_count}
            </Tag>
          )}
          {/* Tamaño normal y separados: con el dedo, "Editar" y "Eliminar" pegados se confunden */}
          <Button onClick={() => onEdit(h)}>Editar</Button>
          <Button danger style={{ marginLeft: 8 }} onClick={() => onDelete(h)}>Eliminar</Button>
        </Flex>
      }
    >
      <Bloque titulo="Anamnesis" mostrar={h.motivo_consulta || h.tiempo_evolucion || h.detalle || h.antecedentes}>
        <Fila label="Motivo" value={h.motivo_consulta} />
        <Fila label="Evolución" value={h.tiempo_evolucion} />
        <Fila label="Detalle" value={h.detalle} />
        <Fila label="Antecedentes" value={h.antecedentes} />
      </Bloque>
      <Bloque titulo="EOG — Constantes" mostrar={h.peso_kg || h.temperatura_c || h.frecuencia_cardiaca || h.mucosas || h.hidratacion}>
        <Flex wrap gap="2px 20px">
          {h.peso_kg && <Fila label="Peso" value={`${h.peso_kg} kg`} />}
          {h.temperatura_c && <Fila label="T°" value={`${h.temperatura_c} °C`} />}
          {h.frecuencia_cardiaca && <Fila label="FC" value={`${h.frecuencia_cardiaca} lpm`} />}
          {h.frecuencia_respiratoria && <Fila label="FR" value={`${h.frecuencia_respiratoria} rpm`} />}
          {h.condicion_corporal && <Fila label="CC" value={`${h.condicion_corporal}/9`} />}
        </Flex>
        <Fila label="Mucosas" value={getLabel('mucosas', h.mucosas)} />
        <Fila label="TLLC" value={getLabel('tllc', h.tllc)} />
        <Fila label="Sensorio" value={getLabel('estado_sensorio', h.estado_sensorio)} />
        <Fila label="Hidrat." value={getLabel('hidratacion', h.hidratacion)} />
        <Fila label="Pulso" value={getLabel('pulso', h.pulso)} />
        <Fila label="Linfon." value={h.linfonodulos} />
      </Bloque>
      <Bloque titulo="EOP — Sistemas" mostrar={epEntries.length > 0}>
        {epEntries.map(({ label, texto }) => <Fila key={label} label={label} value={texto} />)}
      </Bloque>
      <Bloque titulo="Diagnóstico" mostrar={h.diagnostico_presuntivo || h.diagnosticos_diferenciales || h.diagnostico_definitivo}>
        <Fila label="Presuntivo" value={h.diagnostico_presuntivo} />
        <Fila label="Diferenciales" value={h.diagnosticos_diferenciales} />
        <Fila label="Definitivo" value={h.diagnostico_definitivo} />
      </Bloque>
      <Bloque titulo="Plan" mostrar={txItems.length > 0 || vxItems.length > 0 || h.examenes_solicitados || h.indicaciones}>
        <Fila label="Exámenes" value={h.examenes_solicitados} />
        {txItems.map((t, i) => (
          <Fila key={i} label={`Tto ${i + 1}`}
            value={[
              t.medicamento, t.dosis, t.via, t.frecuencia,
              t.duracion_dias ? `${t.duracion_dias} día${Number(t.duracion_dias) > 1 ? 's' : ''}` : t.duracion,
            ].filter(Boolean).join(' · ')} />
        ))}
        {vxItems.map((v, i) => (
          <Fila key={i} label={`Vac ${i + 1}`}
            value={[v.vacuna, v.lote, v.proxima_dosis ? `próx. ${fechaISOCorta(v.proxima_dosis)}` : null].filter(Boolean).join(' · ')} />
        ))}
        <Fila label="Indicaciones" value={h.indicaciones} />
        <Fila label="Pronóstico" value={getLabel('pronostico', h.pronostico)} />
        <Fila label="Próx. cita" value={h.proxima_cita ? fechaNumericaPeru(h.proxima_cita) : null} />
      </Bloque>
    </Card>
  )
}
