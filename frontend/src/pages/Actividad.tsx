import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Avatar, Button, Checkbox, Col, DatePicker, Empty, Flex, Row, Select, Skeleton, Space, Tag, Typography, Pagination } from 'antd'
import {
  DownloadOutlined, HistoryOutlined, ReloadOutlined, UserOutlined, MedicineBoxOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { api } from '../services/api'
import { useRefrescoAuto } from '../hooks/useRefrescoAuto'
import { useToast } from '../components/Toast'
import { Fila, Panel } from '../components/PanelLista'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

const INTERVALO_MS = 15000  // auto-actualización cada 15 s
const POR_PAGINA = 50

interface Evento {
  id: number; fecha: string; usuario?: string | null; rol?: string | null; accion?: string | null
  detalle?: string | null; metodo?: string | null; ruta?: string | null; estado?: string | number | null
}
interface UsuarioLista { id: number; nombre: string; usuario: string }
interface Filtros { usuario: string; desde: string; hasta: string }

const FILTROS_VACIOS: Filtros = { usuario: '', desde: '', hasta: '' }
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

function fmtFechaHora(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// "hace X" relativo
function hace(iso?: string | null) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}

function paramsDe(f: Filtros, extra: Record<string, string> = {}) {
  const p = new URLSearchParams(extra)
  if (f.usuario) p.set('usuario', f.usuario)
  if (f.desde) p.set('desde', f.desde)
  if (f.hasta) p.set('hasta', f.hasta)
  return p
}

export default function Actividad() {
  const toast = useToast()
  const [items, setItems] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [auto, setAuto] = useState(true)
  const [ultima, setUltima] = useState<Date | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([])
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [exportando, setExportando] = useState(false)
  // La auto-actualización usa siempre los filtros ya aplicados (los "Buscar"), no lo que se está escribiendo.
  const aplicados = useRef<{ f: Filtros; pag: number }>({ f: FILTROS_VACIOS, pag: 1 })

  const cargar = useCallback(async (silencioso = false, f: Filtros = aplicados.current.f, pag: number = aplicados.current.pag) => {
    aplicados.current = { f, pag }
    if (!silencioso) setCargando(true)
    try {
      const [d, c] = await Promise.all([
        api.get(`/api/actividad/?${paramsDe(f, { limite: String(POR_PAGINA), skip: String((pag - 1) * POR_PAGINA) })}`),
        api.get(`/api/actividad/contar?${paramsDe(f)}`),
      ])
      setItems(Array.isArray(d) ? d : [])
      setTotal(c?.total ?? 0)
      setError(null)
      setUltima(new Date())
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { api.get('/api/usuarios/').then((u: UsuarioLista[]) => setUsuarios(Array.isArray(u) ? u : [])).catch(() => {}) }, [])

  useRefrescoAuto(() => cargar(true), INTERVALO_MS, auto)

  const buscar = () => { setPagina(1); cargar(false, filtros, 1) }
  const limpiar = () => { setFiltros(FILTROS_VACIOS); setPagina(1); cargar(false, FILTROS_VACIOS, 1) }
  const irPagina = (nueva: number) => { setPagina(nueva); cargar(false, aplicados.current.f, nueva) }

  // Exporta TODOS los eventos del filtro (no solo la página), en lotes de 500 (tope del backend).
  const exportar = async () => {
    setExportando(true)
    try {
      const LOTE = 500
      let skip = 0
      let todos: Evento[] = []
      while (true) {
        const lote = await api.get(`/api/actividad/?${paramsDe(aplicados.current.f, { limite: String(LOTE), skip: String(skip) })}`)
        if (!Array.isArray(lote) || lote.length === 0) break
        todos = todos.concat(lote)
        if (lote.length < LOTE) break
        skip += LOTE
      }
      if (todos.length === 0) { toast.error('No hay eventos para exportar.'); return }
      const cab = ['Fecha', 'Usuario', 'Rol', 'Accion', 'Detalle', 'Metodo', 'Ruta', 'Estado']
      const filas = todos.map(a => [
        fmtFechaHora(a.fecha), a.usuario ?? '', a.rol ?? '', a.accion ?? '', a.detalle ?? '', a.metodo ?? '', a.ruta ?? '', a.estado ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      const csv = '﻿' + [cab.join(','), ...filas].join('\r\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
      const a = document.createElement('a')
      a.href = url; a.download = `actividad_${new Date().toISOString().slice(0, 10)}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setExportando(false)
    }
  }

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)
  const hayFiltros = !!(filtros.usuario || filtros.desde || filtros.hasta)
  const fecha = (v: Dayjs | null) => (v ? v.format('YYYY-MM-DD') : '')

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Bitácora de actividad
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Quién hizo qué y cuándo{ultima && ` · actualizado ${ultima.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </Text>
        </Col>
        <Col>
          <Space wrap>
            <Checkbox checked={auto} onChange={e => setAuto(e.target.checked)}>Auto-actualizar</Checkbox>
            <Button icon={<DownloadOutlined />} loading={exportando} disabled={total === 0} onClick={exportar}>Exportar</Button>
            <Button icon={<ReloadOutlined spin={cargando} />} disabled={cargando} onClick={() => cargar()}>Actualizar</Button>
          </Space>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => cargar()}>Reintentar</Button>} />}

        <Flex gap={8} wrap align="center">
          <Select allowClear showSearch style={{ minWidth: 240 }} placeholder="Todos los usuarios" aria-label="Filtrar por usuario"
            value={filtros.usuario || undefined} optionFilterProp="label"
            onChange={v => setFiltros(f => ({ ...f, usuario: v ?? '' }))}
            options={usuarios.map(u => ({ value: u.usuario, label: `${u.nombre} (${u.usuario})` }))} />
          <DatePicker placeholder="Desde" aria-label="Desde" value={filtros.desde ? dayjs(filtros.desde) : null}
            onChange={v => setFiltros(f => ({ ...f, desde: fecha(v) }))} />
          <DatePicker placeholder="Hasta" aria-label="Hasta" value={filtros.hasta ? dayjs(filtros.hasta) : null}
            onChange={v => setFiltros(f => ({ ...f, hasta: fecha(v) }))} />
          <Button type="primary" onClick={buscar}>Buscar</Button>
          {hayFiltros && <Button type="text" onClick={limpiar}>Limpiar</Button>}
        </Flex>

        <Panel titulo="Últimas acciones" icono={<HistoryOutlined />} accion={<Tag style={{ margin: 0 }}>{total}</Tag>}>
          {cargando && items.length === 0
            ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
            : items.length === 0
              ? <Empty style={{ padding: '40px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aún no hay acciones registradas." />
              : items.map(a => (
                <Fila key={a.id}>
                  <Avatar icon={a.rol === 'recepcionista' ? <UserOutlined /> : <MedicineBoxOutlined />} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      <Text strong>{a.usuario}</Text> — {a.accion}
                      {a.detalle && <Text type="secondary"> · {a.detalle}</Text>}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{fmtFechaHora(a.fecha)} · {hace(a.fecha)}</Text>
                  </div>
                  {a.rol && <Tag color={a.rol === 'recepcionista' ? 'blue' : 'green'} style={{ margin: 0 }}>{a.rol}</Tag>}
                </Fila>
              ))}
          {total > POR_PAGINA && (
            <Flex justify="end" style={{ padding: '12px 20px' }}>
              <Pagination current={pagina} total={total} pageSize={POR_PAGINA} showSizeChanger={false} onChange={irPagina}
                showTotal={(t) => `${t} eventos`} />
            </Flex>
          )}
        </Panel>
      </Space>
    </div>
  )
}
