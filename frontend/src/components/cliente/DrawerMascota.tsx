/**
 * Resumen rápido de una mascota desde la ficha del dueño (lo que antes era el
 * panel de la derecha): próxima cita, alertas, antecedentes, historial
 * reciente, documentos y atajos para atender, agendar, escribir por WhatsApp o
 * cobrar. Se abre desde el menú «⋯» de la fila.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Descriptions, Divider, Drawer, Empty, Flex, List, Spin, Tag, Typography } from 'antd'
import {
  CalendarOutlined, FileTextOutlined, MedicineBoxOutlined, ShoppingCartOutlined, WhatsAppOutlined,
} from '@ant-design/icons'
import { api, esAdmin } from '../../services/api'
import { estadoLabel, waRecordatorio } from '../../utils/citas'
import DocumentosPaciente from '../DocumentosPaciente'
import type { Mascota } from './MascotaModal'

interface HistoriaResumen {
  id: number
  fecha?: string | null
  creado_en: string
  motivo_consulta?: string | null
  diagnostico_presuntivo?: string | null
  antecedentes?: string | null
}
interface Cita { id: number; fecha_hora: string; motivo?: string | null; estado: string }
export interface ClienteResumen { id: number; nombre: string; telefono?: string | null }

interface Props {
  paciente: Mascota | null
  cliente: ClienteResumen | null
  onCerrar: () => void
  onAtender: (p: Mascota) => void
  onAgendar: (p: Mascota) => void
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })

export default function DrawerMascota({ paciente, cliente, onCerrar, onAtender, onAgendar }: Props) {
  const navigate = useNavigate()
  const [historias, setHistorias] = useState<HistoriaResumen[]>([])
  const [citas, setCitas] = useState<Cita[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!paciente) return
    let vigente = true
    setCargando(true)
    Promise.all([
      api.get(`/api/pacientes/${paciente.id}/historias/`),
      api.get(`/api/citas/?paciente_id=${paciente.id}`),
    ])
      .then(([h, c]) => {
        if (!vigente) return
        setHistorias(Array.isArray(h) ? h : []); setCitas(Array.isArray(c) ? c : [])
      })
      .catch(() => { if (vigente) { setHistorias([]); setCitas([]) } })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [paciente])

  const ahora = new Date()
  const proximaCita = [...citas]
    .filter(c => new Date(c.fecha_hora) >= ahora && c.estado !== 'cancelada')
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())[0] ?? null
  const orden = [...historias].sort(
    (a, b) => new Date(b.fecha || b.creado_en).getTime() - new Date(a.fecha || a.creado_en).getTime())
  const ultima = orden[0] ?? null
  const sinTelefono = !(cliente?.telefono || '').trim()

  const irHistorial = () => paciente && navigate(`/pacientes/${paciente.id}/historial`, { state: { paciente, cliente } })

  return (
    <Drawer
      open={!!paciente} onClose={onCerrar} size="large" destroyOnHidden
      title={paciente ? `${paciente.nombre} · ${[paciente.especie, paciente.raza].filter(Boolean).join(' · ')}` : ''}
    >
      {paciente && (
        <Flex vertical gap={14}>
          {paciente.alergias && <Alert type="warning" showIcon title={`Alergias: ${paciente.alergias}`} />}
          {paciente.condiciones_cronicas && <Alert type="info" showIcon title={`Crónico: ${paciente.condiciones_cronicas}`} />}

          <Descriptions
            size="small" column={3} colon={false} layout="vertical"
            items={[
              { key: 'n', label: 'Consultas', children: cargando ? '—' : historias.length },
              { key: 'u', label: 'Última visita', children: ultima ? fmtFecha(ultima.fecha || ultima.creado_en) : '—' },
              { key: 'p', label: 'Próxima cita', children: proximaCita ? fmtFecha(proximaCita.fecha_hora) : 'Sin cita' },
            ]}
          />

          {proximaCita && (
            <Alert
              type="success" showIcon icon={<CalendarOutlined />}
              title={`${fmtFecha(proximaCita.fecha_hora)} · ${fmtHora(proximaCita.fecha_hora)}${proximaCita.motivo ? ` · ${proximaCita.motivo}` : ''}`}
              description={<Tag style={{ margin: 0 }}>{estadoLabel(proximaCita.estado)}</Tag>}
            />
          )}

          <Flex gap={8} wrap>
            <Button type="primary" icon={<MedicineBoxOutlined />} onClick={() => onAtender(paciente)}>
              Atender / Iniciar consulta
            </Button>
            <Button icon={<FileTextOutlined />} onClick={irHistorial}>Historia clínica</Button>
            <Button icon={<CalendarOutlined />} onClick={() => onAgendar(paciente)}>Agendar cita</Button>
            {sinTelefono ? (
              <Button icon={<WhatsAppOutlined />} disabled title="El cliente no tiene teléfono registrado">WhatsApp</Button>
            ) : (
              <Button
                icon={<WhatsAppOutlined />} target="_blank" rel="noopener noreferrer"
                href={waRecordatorio(cliente?.telefono, cliente?.nombre, paciente.nombre, proximaCita)}
              >
                WhatsApp
              </Button>
            )}
            {/* Cobrar venta es función administrativa (recepcionista): oculto para veterinarios */}
            {esAdmin() && (
              <Button
                icon={<ShoppingCartOutlined />}
                onClick={() => navigate('/ventas', { state: { clienteId: cliente?.id, abrirVenta: true } })}
              >
                Cobrar venta
              </Button>
            )}
          </Flex>

          <Divider style={{ margin: '4px 0' }}>Antecedentes</Divider>
          {cargando ? <Spin /> : ultima?.antecedentes ? (
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ultima.antecedentes}</Typography.Paragraph>
          ) : (
            <Typography.Text type="secondary">Sin antecedentes registrados en la última consulta.</Typography.Text>
          )}

          <Divider style={{ margin: '4px 0' }}>Historial reciente</Divider>
          {cargando ? <Spin /> : orden.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aún no hay consultas registradas." />
          ) : (
            <List
              size="small" dataSource={orden.slice(0, 5)}
              renderItem={h => (
                <List.Item style={{ cursor: 'pointer' }} onClick={irHistorial}>
                  <List.Item.Meta
                    title={h.motivo_consulta || '(sin motivo)'}
                    description={`${fmtFecha(h.fecha || h.creado_en)}${h.diagnostico_presuntivo ? ` · Dx: ${h.diagnostico_presuntivo}` : ''}`}
                  />
                </List.Item>
              )}
            />
          )}

          <Divider style={{ margin: '4px 0' }}>Documentos (radiografías, análisis…)</Divider>
          <DocumentosPaciente pacienteId={paciente.id} />
        </Flex>
      )}
    </Drawer>
  )
}
