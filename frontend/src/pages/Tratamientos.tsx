/**
 * Tratamientos: la lista de trabajo que no existía.
 *
 * Lo indicado en una consulta se escribía y se olvidaba. No había forma de
 * saber qué mascotas están medicadas hoy, cuáles terminan esta semana ni —lo
 * que de verdad se cae entre las sillas— cuáles terminaron sin que el dueño
 * volviera nunca.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Flex, Input, Row, Segmented, Skeleton, Space, Tag, Tooltip, Typography } from 'antd'
import {
  CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, DownloadOutlined, ExperimentOutlined,
  InboxOutlined, ReloadOutlined, SearchOutlined, StopOutlined, UndoOutlined, WarningOutlined, WhatsAppOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { clinicaActual } from '../services/clinica'
import { Panel } from '../components/PanelLista'
import SuspenderModal from '../components/tratamientos/SuspenderModal'
import { BRAND, ESTADO as COLOR_ESTADO } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

interface Tratamiento {
  id: number
  paciente_id: number
  paciente: string
  especie?: string | null
  propietario?: string | null
  telefono?: string | null
  medicamento: string
  dosis?: string | null
  via?: string | null
  frecuencia?: string | null
  inicio?: string | null
  fin?: string | null
  dias?: number | null
  dias_restantes: number | null
  estado: 'en_curso' | 'terminado' | 'suspendido' | 'sin_duracion' | string
  motivo_corte?: string | null
  sin_control?: boolean
  entregado?: boolean
  producto_id?: number | null
  vencido?: boolean
  vence_el?: string | null
  stock?: number | null
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

const fmt = (iso?: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADOS: Record<string, { label: string; color: string; icono: ReactNode }> = {
  en_curso: { label: 'En curso', color: 'success', icono: <ClockCircleOutlined /> },
  terminado: { label: 'Terminado', color: 'default', icono: <CheckCircleOutlined /> },
  suspendido: { label: 'Suspendido', color: 'error', icono: <StopOutlined /> },
  sin_duracion: { label: 'Sin duración', color: 'warning', icono: <WarningOutlined /> },
}

const FILTROS = [
  { value: 'en_curso', label: 'En curso' },
  { value: 'termina', label: 'Terminan esta semana' },
  { value: 'sin_control', label: 'Terminó y no volvió' },
  { value: 'sin_duracion', label: 'Sin duración' },
  { value: 'todos', label: 'Todos' },
]

const waLink = (t: Tratamiento) => {
  const num = (t.telefono || '').replace(/\D/g, '')
  const intl = num.length === 9 ? `51${num}` : num
  const msg = t.sin_control
    ? `Hola ${t.propietario || ''}, ${t.paciente || 'su mascota'} terminó su tratamiento con *${t.medicamento}* el ${fmt(t.fin)}. ¿Cómo sigue? En ${clinicaActual().nombre} quedamos atentos para el control.`
    : `Hola ${t.propietario || ''}, le recordamos el tratamiento de ${t.paciente || 'su mascota'}: *${t.medicamento}*${t.dosis ? ` ${t.dosis}` : ''}${t.frecuencia ? `, ${t.frecuencia}` : ''}${t.fin ? `, hasta el ${fmt(t.fin)}` : ''}. ${clinicaActual().nombre}`
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
}

const terminaPronto = (t: Tratamiento) => t.estado === 'en_curso' && t.dias_restantes !== null && t.dias_restantes <= 7

export default function Tratamientos() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [items, setItems] = useState<Tratamiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [filtro, setFiltro] = useState('en_curso')
  const [busq, setBusq] = useState('')
  const [suspendiendo, setSuspendiendo] = useState<Tratamiento | null>(null)

  const cargar = useCallback(async () => {
    try {
      const d = await api.get('/api/tratamientos/')
      setItems(Array.isArray(d) ? d : [])
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  const refrescar = async () => { setRefrescando(true); await cargar(); setRefrescando(false) }

  const reemplazar = (r: Tratamiento) => setItems(prev => prev.map(x => x.id === r.id ? r : x))

  const terminar = async (t: Tratamiento) => {
    if (!await confirmar({
      titulo: 'Marcar como terminado',
      mensaje: `${t.medicamento} en ${t.paciente} queda cerrado como cumplido.`,
      confirmarTexto: 'Marcar terminado',
      peligroso: false,
    })) return
    try {
      reemplazar(await api.put(`/api/tratamientos/${t.id}`, { estado: 'terminado', motivo: null }))
      toast.success('Tratamiento terminado.')
    } catch (e) { toast.error(mensajeDe(e)) }
  }

  const suspender = async (t: Tratamiento, motivo: string) => {
    try {
      reemplazar(await api.put(`/api/tratamientos/${t.id}`, { estado: 'suspendido', motivo }))
      toast.success('Tratamiento suspendido.')
      setSuspendiendo(null)
    } catch (e) { toast.error(mensajeDe(e)) }
  }

  const reabrir = async (t: Tratamiento) => {
    try {
      reemplazar(await api.post(`/api/tratamientos/${t.id}/reabrir`, {}))
      toast.success('Tratamiento reabierto.')
    } catch (e) { toast.error(mensajeDe(e)) }
  }

  const term = busq.trim().toLowerCase()
  const filtrados = items.filter(t => {
    if (filtro === 'en_curso' && t.estado !== 'en_curso') return false
    if (filtro === 'termina' && !terminaPronto(t)) return false
    if (filtro === 'sin_control' && !t.sin_control) return false
    if (filtro === 'sin_duracion' && t.estado !== 'sin_duracion') return false
    if (term && !`${t.paciente ?? ''} ${t.propietario ?? ''} ${t.medicamento ?? ''}`.toLowerCase().includes(term)) return false
    return true
  })

  const enCurso = items.filter(t => t.estado === 'en_curso').length
  const terminan = items.filter(terminaPronto).length
  const sinControl = items.filter(t => t.sin_control).length

  const exportarCSV = () => {
    const cab = ['Paciente', 'Medicamento', 'Dosis', 'Frecuencia', 'Inicio', 'Fin', 'Estado', 'Dueno', 'Telefono']
    const filas = filtrados.map(t => [
      t.paciente, t.medicamento, t.dosis ?? '', t.frecuencia ?? '',
      fmt(t.inicio), fmt(t.fin), ESTADOS[t.estado]?.label ?? t.estado,
      t.propietario, t.telefono ?? '',
    ].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = '﻿' + [cab.join(','), ...filas].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `tratamientos_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  // Los tres números que importan
  const tarjetas = [
    { n: enCurso, l: 'Medicados hoy', icono: <ExperimentOutlined />, color: BRAND.primary },
    { n: terminan, l: 'Terminan en 7 días', icono: <CalendarOutlined />, color: COLOR_ESTADO.atencion },
    { n: sinControl, l: 'Terminó y no volvió', icono: <WarningOutlined />, color: sinControl ? COLOR_ESTADO.peligro : BRAND.primary },
  ]

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Tratamientos
          </Title>
        </Col>
        <Col>
          <Space wrap>
            <Button icon={<DownloadOutlined />} disabled={filtrados.length === 0} onClick={exportarCSV}>Excel</Button>
            <Button icon={<ReloadOutlined spin={refrescando} />} disabled={refrescando} onClick={refrescar}>Actualizar</Button>
          </Space>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Row gutter={[16, 16]}>
          {tarjetas.map((t, i) => (
            <Col key={t.l} xs={24} sm={8}>
              <Card className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
                <Flex gap={14} align="center">
                  <div style={{ fontSize: 22, color: t.color, background: BRAND.panel, width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center' }}>{t.icono}</div>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 500, lineHeight: '34px', color: t.color }}>{cargando ? '—' : t.n}</div>
                    <Text type="secondary">{t.l}</Text>
                  </div>
                </Flex>
              </Card>
            </Col>
          ))}
        </Row>

        <Panel titulo="Seguimiento" icono={<ExperimentOutlined />} accion={<Tag>{filtrados.length}</Tag>}>
          <Flex gap={12} wrap align="center" style={{ padding: '12px 20px' }}>
            <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Segmented value={filtro} options={FILTROS} onChange={v => setFiltro(String(v))} />
            </div>
            <Input allowClear prefix={<SearchOutlined />} placeholder="Mascota, dueño o medicamento…" aria-label="Buscar tratamiento"
              value={busq} onChange={e => setBusq(e.target.value)} style={{ width: 260, marginLeft: 'auto' }} />
          </Flex>

          {error && <Alert type="error" showIcon title={error} style={{ margin: '0 20px 16px' }} action={<Button size="small" onClick={refrescar}>Reintentar</Button>} />}

          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 5 }} /></div>
            : !error && filtrados.length === 0 ? (
              <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={filtro === 'sin_control' ? 'Nadie quedó sin control. Bien ahí.' : 'Nada por acá'} />
            ) : filtrados.map(t => {
              const est = ESTADOS[t.estado] ?? ESTADOS.terminado
              const abierto = t.estado === 'en_curso' || t.estado === 'sin_duracion'
              return (
                <div key={t.id} className="fila-hover" style={{ padding: '12px 20px', borderTop: `1px solid ${BRAND.border}` }}>
                  <Flex justify="space-between" align="flex-start" gap={12} wrap>
                    <div style={{ minWidth: 0 }}>
                      <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 500 }}
                        onClick={() => navigate(`/pacientes/${t.paciente_id}/historial`)}>{t.paciente}</Button>
                      <Text type="secondary" style={{ fontSize: 12 }}> · {t.especie}</Text>
                      <div>
                        {t.medicamento}
                        <Text type="secondary">{[t.dosis, t.via, t.frecuencia].filter(Boolean).map(x => ` · ${x}`).join('')}</Text>
                      </div>
                    </div>
                    <Space size={6} wrap>
                      {t.entregado && <Tooltip title="Se cobró este medicamento para esta mascota"><Tag color="blue" icon={<InboxOutlined />} style={{ margin: 0 }}>Entregado</Tag></Tooltip>}
                      {t.producto_id && t.vencido && <Tooltip title={`El lote vence el ${fmt(t.vence_el)}`}><Tag color="warning" icon={<WarningOutlined />} style={{ margin: 0 }}>Lote vencido</Tag></Tooltip>}
                      {t.producto_id && !t.vencido && t.stock === 0 && <Tag color="warning" icon={<WarningOutlined />} style={{ margin: 0 }}>Sin stock</Tag>}
                      {t.sin_control && <Tag color="error" icon={<WarningOutlined />} style={{ margin: 0 }}>Sin control</Tag>}
                      <Tag color={est.color} icon={est.icono} style={{ margin: 0 }}>{est.label}</Tag>
                    </Space>
                  </Flex>

                  <Flex justify="space-between" align="center" gap={12} wrap style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {t.dias
                        ? <>Del {fmt(t.inicio)} al {fmt(t.fin)} · {t.dias} día{t.dias > 1 ? 's' : ''}</>
                        : <>Desde el {fmt(t.inicio)} · <span style={{ color: COLOR_ESTADO.atencion }}>sin duración anotada</span></>}
                      {t.estado === 'en_curso' && t.dias_restantes !== null && (
                        <Text strong>{' · '}{t.dias_restantes === 0 ? 'termina hoy' : `quedan ${t.dias_restantes} día${t.dias_restantes > 1 ? 's' : ''}`}</Text>
                      )}
                      {t.motivo_corte && <span style={{ color: COLOR_ESTADO.peligro }}> · {t.motivo_corte}</span>}
                    </Text>
                    <Space size={6} style={{ marginLeft: 'auto' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t.propietario}</Text>
                      {t.telefono && (
                        <Tooltip title="Escribir por WhatsApp">
                          <Button type="primary" icon={<WhatsAppOutlined />} aria-label="Escribir por WhatsApp"
                            href={waLink(t)} target="_blank" rel="noopener noreferrer" style={{ background: '#25a244' }} />
                        </Tooltip>
                      )}
                      {abierto ? (
                        <>
                          <Tooltip title="Marcar como terminado"><Button icon={<CheckCircleOutlined />} aria-label="Marcar como terminado" onClick={() => terminar(t)} /></Tooltip>
                          <Tooltip title="Suspender"><Button danger icon={<StopOutlined />} aria-label="Suspender" onClick={() => setSuspendiendo(t)} /></Tooltip>
                        </>
                      ) : (
                        <Tooltip title="Reabrir"><Button icon={<UndoOutlined />} aria-label="Reabrir" onClick={() => reabrir(t)} /></Tooltip>
                      )}
                    </Space>
                  </Flex>
                </div>
              )
            })}
        </Panel>
      </Space>

      {suspendiendo && (
        <SuspenderModal medicamento={suspendiendo.medicamento} paciente={suspendiendo.paciente}
          onCerrar={() => setSuspendiendo(null)} onConfirmar={motivo => suspender(suspendiendo, motivo)} />
      )}
    </div>
  )
}
