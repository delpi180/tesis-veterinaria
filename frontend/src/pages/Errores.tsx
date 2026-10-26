import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Col, Empty, Flex, Row, Skeleton, Space, Tag, Tooltip, Typography } from 'antd'
import {
  CheckOutlined, CloudServerOutlined, DesktopOutlined, DownOutlined, ReloadOutlined, RightOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { useRefrescoAuto } from '../hooks/useRefrescoAuto'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text, Paragraph } = Typography

const INTERVALO_MS = 30000

interface ErrorSistema {
  id: number; origen: 'frontend' | 'backend' | string; mensaje: string; ruta?: string | null; usuario?: string | null
  fecha?: string | null; veces?: number; visto?: boolean; detalle?: string | null; navegador?: string | null
}

const fmtFechaHora = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

const ORIGEN = {
  frontend: { label: 'Navegador', icono: <DesktopOutlined />, color: 'blue' },
  backend: { label: 'Servidor', icono: <CloudServerOutlined />, color: 'green' },
} as const

/**
 * Errores del sistema, para dar soporte sin depender del relato del usuario.
 *
 * No es una pantalla que se mire a diario: existe para cuando la clínica avisa
 * que algo no funciona y hay que saber qué pasó, en qué pantalla y a quién.
 */
export default function Errores() {
  const [items, setItems] = useState<ErrorSistema[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [abierto, setAbierto] = useState<number | null>(null)

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    try {
      const d = await api.get(`/api/errores/?solo_pendientes=${soloPendientes}&limite=100`)
      setItems(Array.isArray(d) ? d : [])
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [soloPendientes])

  useEffect(() => { cargar() }, [cargar])
  useRefrescoAuto(() => cargar(true), INTERVALO_MS)

  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  const marcarVisto = async (e: ErrorSistema) => {
    try {
      await api.put(`/api/errores/${e.id}/visto`)
      // Con el filtro de pendientes activo desaparece de la lista; si no, solo cambia de estado.
      setItems(prev => soloPendientes
        ? prev.filter(x => x.id !== e.id)
        : prev.map(x => x.id === e.id ? { ...x, visto: true } : x))
    } catch (err) {
      setError(mensajeDe(err))
    }
  }

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Errores del sistema
          </Title>
        </Col>
        <Col>
          <Space wrap>
            <Checkbox checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)}>Solo sin revisar</Checkbox>
            <Button icon={<ReloadOutlined spin={refrescando} />} disabled={refrescando} onClick={refrescar}>Actualizar</Button>
          </Space>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={error} closable={{ onClose: () => setError(null) }} />}

        <Text type="secondary" style={{ fontSize: 13 }}>
          Cuando algo falla en la clínica queda registrado acá con su contexto, en vez de perderse.
          Los repetidos se agrupan y muestran cuántas veces pasó.
        </Text>

        {cargando ? <Card><Skeleton active paragraph={{ rows: 5 }} /></Card>
          : items.length === 0 ? (
            <Card>
              <Empty image={<CheckOutlined style={{ fontSize: 40, color: BRAND.primary }} />}
                description={<>
                  <Text strong>{soloPendientes ? 'Sin errores pendientes de revisar' : 'Sin errores registrados'}</Text>
                  <br /><Text type="secondary">Todo viene funcionando.</Text>
                </>} />
            </Card>
          ) : items.map((e, i) => {
            const o = ORIGEN[e.origen as keyof typeof ORIGEN] ?? ORIGEN.frontend
            const expandido = abierto === e.id
            return (
              <Card key={e.id} size="small" className="tarjeta-viva animar"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, opacity: e.visto ? 0.7 : 1 }}>
                <Flex gap={12} align="flex-start">
                  <Tag color={o.color} icon={o.icono} style={{ margin: 0 }}>{o.label}</Tag>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ wordBreak: 'break-word' }}>{e.mensaje}</Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {e.ruta && <Text code style={{ fontSize: 12 }}>{e.ruta}</Text>}
                        {e.usuario && <> · {e.usuario}</>} · {fmtFechaHora(e.fecha)}
                      </Text>
                    </div>
                  </div>
                  <Space size={4}>
                    {(e.veces ?? 0) > 1 && <Tooltip title="Veces que ocurrió"><Tag color="warning" style={{ margin: 0 }}>×{e.veces}</Tag></Tooltip>}
                    {!e.visto && (
                      <Tooltip title="Marcar como revisado">
                        <Button type="text" icon={<CheckOutlined />} aria-label="Marcar como revisado" onClick={() => marcarVisto(e)} />
                      </Tooltip>
                    )}
                    {e.detalle && (
                      <Tooltip title={expandido ? 'Ocultar detalle' : 'Ver detalle técnico'}>
                        <Button type="text" icon={expandido ? <DownOutlined /> : <RightOutlined />} aria-expanded={expandido}
                          aria-label={expandido ? 'Ocultar detalle' : 'Ver detalle técnico'} onClick={() => setAbierto(expandido ? null : e.id)} />
                      </Tooltip>
                    )}
                  </Space>
                </Flex>
                {expandido && e.detalle && (
                  <div className="animar" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BRAND.border}` }}>
                    <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 288, overflowY: 'auto' }}>{e.detalle}</pre>
                    {e.navegador && (
                      <Paragraph type="secondary" style={{ fontSize: 11, margin: '8px 0 0', wordBreak: 'break-word' }}>
                        <strong>Navegador:</strong> {e.navegador}
                      </Paragraph>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
      </Space>
    </div>
  )
}
