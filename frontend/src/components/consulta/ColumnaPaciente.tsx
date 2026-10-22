/**
 * Columna derecha de la consulta y del historial, como en Volki: nombre del
 * paciente con «Historia clínica ⭳», la ficha, quién es el responsable y los
 * recordatorios (próximos turnos y próximas dosis de vacuna). Todo sale de
 * datos que la pantalla ya tiene; los botones solo aparecen si la pantalla
 * pasa la acción (en la consulta, por ejemplo, no se edita la ficha).
 */
import { Link } from 'react-router-dom'
import { Alert, Avatar, Button, Card, Descriptions, Empty, Flex, List, Tag, Typography } from 'antd'
import { DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { PawPrint } from 'lucide-react'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'
import { edadLegible, fechaISOCorta, fechaPeru, proximasDosis, ultimoPeso } from '@src/utils/historiaClinica'
import type { Historia } from '@src/utils/historiaClinica'

export interface FichaPaciente {
  id?: number
  nombre: string
  especie?: string
  raza?: string | null
  edad?: number | null
  sexo?: 'macho' | 'hembra' | null
  esterilizado?: boolean | null
  fecha_nacimiento?: string | null
  color?: string | null
  microchip?: string | null
  alergias?: string | null
  condiciones_cronicas?: string | null
  cliente_id?: number
  /** Cuándo y quién registró la ficha (el servidor los manda desde la migración de Volki). */
  creado_en?: string | null
  registrado_por?: string | null
}

export interface FichaResponsable { id: number; nombre: string; telefono?: string | null }

export interface TurnoPaciente { id: number; fecha_hora: string; motivo?: string | null; estado: string }

interface Props {
  paciente: FichaPaciente
  responsable: FichaResponsable | null
  historias: Historia[]
  turnos: TurnoPaciente[]
  /** «Historia clínica ⭳»: descarga el historial completo en PDF. */
  onDescargar?: () => void
  /** «Editar ficha»: abre la edición de los datos de la mascota. */
  onEditar?: () => void
  /** «Nuevo +» de Recordatorios: agenda un turno para la mascota. */
  onNuevoRecordatorio?: () => void
  /** «Cambiar» del responsable: abre la búsqueda del nuevo dueño. */
  onCambiarResponsable?: () => void
}

/** Título de bloque (como «Recordatorios» o el nombre del paciente en Volki): texto a la izquierda y una acción a la derecha. */
function TituloBloque({ children, nivel = 5, accion }: { children: React.ReactNode; nivel?: 4 | 5; accion?: React.ReactNode }) {
  return (
    <Flex justify="space-between" align="center" gap={8} style={nivel === 4 ? { padding: '16px 0 0' } : undefined}>
      {/* 22/30 el nombre del paciente y 20/32 los títulos de sección, ambos con peso 500, como en Volki */}
      <Typography.Title
        level={nivel} ellipsis
        style={{
          margin: 0, minWidth: 0, fontWeight: 500,
          fontSize: nivel === 4 ? MEDIDAS.tituloLateral : MEDIDAS.tituloSeccion,
          lineHeight: nivel === 4 ? '30px' : '32px',
        }}
      >
        {children}
      </Typography.Title>
      {accion}
    </Flex>
  )
}

export default function ColumnaPaciente({
  paciente, responsable, historias, turnos, onDescargar, onEditar, onNuevoRecordatorio, onCambiarResponsable,
}: Props) {
  const edad = edadLegible(paciente)
  const peso = ultimoPeso(historias)
  const dosis = proximasDosis(historias)
  const horaTurno = (iso: string) =>
    new Date(iso).toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
    })
  const hayRecordatorios = turnos.length > 0 || dosis.length > 0

  return (
    <Flex vertical gap={MEDIDAS.tarjetaSeparacion}>
      <TituloBloque
        nivel={4}
        accion={onDescargar && (
          <Button type="link" icon={<DownloadOutlined />} iconPlacement="end" onClick={onDescargar} style={{ padding: 0 }}>
            Historia clínica
          </Button>
        )}
      >
        {paciente.nombre}
      </TituloBloque>

      <Card variant="borderless" styles={{ header: { display: 'none' } }}>
        <Flex vertical gap={10}>
          <Flex gap={12} align="center">
            <Avatar size={56} icon={<PawPrint size={26} />} style={{ background: BRAND.panel, color: BRAND.primary, flexShrink: 0 }} />
            <Flex vertical style={{ minWidth: 0 }}>
              <Typography.Text strong style={{ fontSize: 16 }}>{paciente.especie || '—'}</Typography.Text>
              {edad && <Typography.Text type="secondary">{edad}</Typography.Text>}
            </Flex>
          </Flex>
          <Descriptions
            size="small" column={1} colon={false}
            styles={{ label: { color: BRAND.textSecondary } }}
            items={[
              { key: 'raza', label: 'Raza', children: paciente.raza || '—' },
              {
                key: 'sexo', label: 'Sexo',
                children: paciente.sexo
                  ? `${paciente.sexo === 'hembra' ? 'Hembra' : 'Macho'}${paciente.esterilizado ? ' · esterilizado' : ''}`
                  : '—',
              },
              ...(paciente.color ? [{ key: 'color', label: 'Color', children: paciente.color }] : []),
              ...(paciente.microchip ? [{ key: 'chip', label: 'Microchip', children: paciente.microchip }] : []),
              { key: 'peso', label: 'Último peso', children: peso ? `${peso.kg} kg · ${peso.fecha}` : '—' },
            ]}
          />
          {paciente.alergias && <Alert type="warning" showIcon title={`Alergias: ${paciente.alergias}`} />}
          {paciente.condiciones_cronicas && (
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              Condiciones crónicas: {paciente.condiciones_cronicas}
            </Typography.Paragraph>
          )}
          {paciente.creado_en && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Registrado el {fechaPeru(paciente.creado_en)}{paciente.registrado_por ? ` por ${paciente.registrado_por}` : ''}
            </Typography.Text>
          )}
          {onEditar && (
            <Flex justify="flex-end">
              <Button type="link" icon={<EditOutlined />} onClick={onEditar} style={{ padding: 0 }}>Editar ficha</Button>
            </Flex>
          )}
        </Flex>
      </Card>

      <Card variant="borderless" styles={{ header: { display: 'none' } }}>
        <Flex vertical gap={2}>
          <Typography.Text style={{ fontSize: 16, lineHeight: '22px' }}>Responsable</Typography.Text>
          {responsable ? (
            <>
              <Link to={`/clientes/${responsable.id}`} style={{ fontWeight: 600 }}>{responsable.nombre}</Link>
              {responsable.telefono && <Typography.Text type="secondary">{responsable.telefono}</Typography.Text>}
            </>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          )}
          {onCambiarResponsable && (
            <Flex justify="flex-end">
              <Button type="link" onClick={onCambiarResponsable} style={{ padding: 0 }}>Cambiar</Button>
            </Flex>
          )}
        </Flex>
      </Card>

      <TituloBloque
        accion={onNuevoRecordatorio && (
          <Button type="link" icon={<PlusOutlined />} iconPlacement="end" onClick={onNuevoRecordatorio} style={{ padding: 0 }}>
            Nuevo
          </Button>
        )}
      >
        Recordatorios
      </TituloBloque>
      {hayRecordatorios ? (
        <List
          size="small" split={false}
          dataSource={[
            ...turnos.map(t => ({
              key: `t${t.id}`, titulo: t.motivo || 'Turno', cuando: horaTurno(t.fecha_hora), tag: 'Turno',
            })),
            ...dosis.map(d => ({
              key: `v${d.vacuna}${d.fecha}`, titulo: d.vacuna, cuando: fechaISOCorta(d.fecha), tag: 'Vacuna',
            })),
          ]}
          renderItem={r => (
            <List.Item style={{ padding: '4px 0' }}>
              <Flex justify="space-between" align="center" gap={8} style={{ width: '100%' }}>
                <Flex vertical style={{ minWidth: 0 }}>
                  <Typography.Text ellipsis>{r.titulo}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.cuando}</Typography.Text>
                </Flex>
                <Tag style={{ margin: 0 }}>{r.tag}</Tag>
              </Flex>
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No hay recordatorios para mostrar." />
      )}
    </Flex>
  )
}
