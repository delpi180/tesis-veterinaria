import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Flex, Input, Progress, Row, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CreditCardOutlined, DownloadOutlined, FilePdfOutlined, FileTextOutlined, MedicineBoxOutlined, PlusOutlined,
  ShoppingCartOutlined, ShoppingOutlined, StopOutlined, TrophyOutlined, RiseOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { exportarCSV } from '../utils/exportUtils'
import { Panel } from '../components/PanelLista'
import AnularModal from '../components/ventas/AnularModal'
import PuntoDeVenta, { type ProductoVenta, type ServicioVenta } from '../components/ventas/PuntoDeVenta'
import { generarBoleta, reporteVentasPDF } from '../components/ventas/pdfVentas'
import { fmtFecha, fmtHora, fmtMoneda, mensajeDe, metodoLabel, nroBoleta, type Venta } from '../components/ventas/tipos'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

const mismoMes = (iso: string, ref: Date) => {
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

export default function Ventas() {
  const { state } = useLocation() as { state: { abrirVenta?: boolean; clienteId?: number | string } | null }
  const navigate = useNavigate()
  const toast = useToast()
  const [ventas, setVentas] = useState<Venta[]>([])
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [servicios, setServicios] = useState<ServicioVenta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState<Venta | null>(null)
  const [rango, setRango] = useState({ desde: '', hasta: '' })

  // Punto de venta: `posAbierto` lo monta; `clienteInicial` solo si llegamos desde la ficha de una mascota.
  const [posAbierto, setPosAbierto] = useState(false)
  const [clienteInicial, setClienteInicial] = useState<string | undefined>()

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [v, p, s] = await Promise.all([
        api.get('/api/ventas/'),
        api.get('/api/productos/'),   // solo activos
        api.get('/api/servicios/'),   // solo activos
      ])
      setVentas(Array.isArray(v) ? v : [])
      setProductos(Array.isArray(p) ? p : [])
      setServicios(Array.isArray(s) ? s : [])
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Cobro integrado: si llegamos desde el panel de la mascota, abrir el punto de venta con ese cliente.
  useEffect(() => {
    if (!state?.abrirVenta) return
    setClienteInicial(state.clienteId ? String(state.clienteId) : undefined)
    setPosAbierto(true)
    navigate('.', { replace: true, state: null })   // limpia el state para no reabrir
  }, [state, navigate])

  // ── Rango de fechas ──
  const cargarRango = async (r: { desde: string; hasta: string }) => {
    setRango(r)
    const params = new URLSearchParams({ limit: '500' })
    if (r.desde) params.set('desde', r.desde)
    if (r.hasta) params.set('hasta', r.hasta)
    try {
      const v = await api.get(r.desde || r.hasta ? `/api/ventas/?${params}` : '/api/ventas/')
      setVentas(Array.isArray(v) ? v : [])
    } catch (e) {
      setError(mensajeDe(e))
    }
  }
  const hayRango = !!(rango.desde || rango.hasta)

  const exportarVentas = () => {
    if (ventas.length === 0) return
    exportarCSV(
      'Ventas',
      ['Boleta', 'Fecha', 'Hora', 'Cliente', 'Detalle', 'Subtotal', 'Descuento %', 'Total', 'Método'],
      ventas.map(v => [
        nroBoleta(v.id), fmtFecha(v.fecha), fmtHora(v.fecha),
        v.cliente_nombre ?? `Cliente #${v.cliente_id}`,
        v.items.map(it => `${it.descripcion} x${it.cantidad}`).join(' | '),
        Number(v.subtotal ?? v.total).toFixed(2),
        Number(v.descuento_pct ?? 0).toFixed(0),
        Number(v.total).toFixed(2),
        metodoLabel(v.metodo_pago),
      ]),
    )
  }

  // ── Indicadores del mes actual ──
  const ahora = new Date()
  const ventasMes = ventas.filter(v => mismoMes(v.fecha, ahora))
  const ingresosMes = ventasMes.reduce((s, v) => s + Number(v.total), 0)
  const unidadesMes = ventasMes.reduce((s, v) => s + v.items.reduce((si, it) => si + it.cantidad, 0), 0)
  const ticketPromedio = ventasMes.length ? ingresosMes / ventasMes.length : 0

  // Más vendidos del mes por monto (productos y servicios)
  const acum: Record<string, { nombre: string; tipo: string; cantidad: number; monto: number }> = {}
  ventasMes.forEach(v => v.items.forEach(it => {
    const key = `${it.tipo}:${it.descripcion}`
    const cur = acum[key] ?? { nombre: it.descripcion, tipo: it.tipo, cantidad: 0, monto: 0 }
    cur.cantidad += it.cantidad
    cur.monto += it.subtotal
    acum[key] = cur
  }))
  const topItems = Object.values(acum).sort((a, b) => b.monto - a.monto).slice(0, 5)
  const maxMonto = topItems.length ? topItems[0].monto : 1

  const hoyTexto = ahora.toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)
  const mesTexto = ahora.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
  const mes = mesTexto.charAt(0).toUpperCase() + mesTexto.slice(1)

  const tarjetas = [
    { titulo: 'Ingresos del mes', valor: fmtMoneda(ingresosMes), icono: <RiseOutlined /> },
    { titulo: 'Ventas del mes', valor: String(ventasMes.length), icono: <ShoppingCartOutlined /> },
    { titulo: 'Ítems vendidos', valor: String(unidadesMes), icono: <ShoppingOutlined /> },
    { titulo: 'Ticket promedio', valor: fmtMoneda(ticketPromedio), icono: <CreditCardOutlined /> },
  ]

  const abrirNueva = () => { setClienteInicial(undefined); setPosAbierto(true) }

  const columnas: TableColumnsType<Venta> = [
    {
      title: 'Boleta', key: 'boleta',
      // Una venta anulada se atenúa pero NO se oculta: el número de comprobante tiene que seguir siendo rastreable.
      render: (_, v) => (
        <div>
          <Text code delete={v.anulada} type={v.anulada ? 'danger' : undefined}>{nroBoleta(v.id)}</Text>
          {v.anulada && <div><Tag color="error" style={{ margin: '4px 0 0' }}>ANULADA</Tag></div>}
        </div>
      ),
    },
    {
      title: 'Fecha', key: 'fecha',
      render: (_, v) => <div><Text>{fmtFecha(v.fecha)}</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>{fmtHora(v.fecha)}</Text></div>,
    },
    { title: 'Cliente', key: 'cliente', render: (_, v) => <Text strong>{v.cliente_nombre ?? `Cliente #${v.cliente_id}`}</Text> },
    {
      title: 'Detalle', key: 'detalle',
      render: (_, v) => <Text type="secondary" style={{ fontSize: 12 }}>{v.items.map(it => `${it.descripcion} ×${it.cantidad}`).join(', ')}</Text>,
    },
    { title: 'Pago', dataIndex: 'metodo_pago', align: 'center', render: (m: string) => <Tag style={{ marginInlineEnd: 0 }}>{metodoLabel(m)}</Tag> },
    {
      title: 'Total', dataIndex: 'total', align: 'right',
      render: (t: number, v) => <Text strong delete={v.anulada} type={v.anulada ? 'secondary' : undefined}>{fmtMoneda(t)}</Text>,
    },
    {
      title: 'Boleta', key: 'acciones', align: 'center',
      render: (_, v) => (
        <div>
          <Space size={4}>
            <Tooltip title="Generar boleta PDF">
              <Button size="small" icon={<FileTextOutlined />}
                onClick={() => generarBoleta(v, v.cliente_nombre ? { nombre: v.cliente_nombre, dni: v.cliente_dni } : null)}>PDF</Button>
            </Tooltip>
            {!v.anulada && (
              <Tooltip title="Anular esta venta">
                <Button size="small" danger icon={<StopOutlined />} onClick={() => setAnulando(v)}>Anular</Button>
              </Tooltip>
            )}
          </Space>
          {v.anulada && v.motivo_anulacion && (
            <div style={{ marginTop: 4, maxWidth: 200, marginInline: 'auto' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{v.motivo_anulacion}{v.anulada_por ? ` · por ${v.anulada_por}` : ''}</Text>
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Ventas y reportes
          </Title>
        </Col>
        <Col>
          <Space wrap>
            <Tag color="green" style={{ margin: 0, padding: '4px 12px', fontSize: 13 }}>{mes}</Tag>
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirNueva}>Nueva venta</Button>
          </Space>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={`No se pudo conectar con el servidor: ${error}`} action={<Button size="small" onClick={cargar}>Reintentar</Button>} />}

        <Row gutter={[16, 16]}>
          {tarjetas.map((t, i) => (
            <Col key={t.titulo} xs={12} md={6}>
              <Card className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
                <Flex justify="space-between" align="center">
                  <Text type="secondary">{t.titulo}</Text>
                  <span style={{ color: BRAND.primary }}>{t.icono}</span>
                </Flex>
                <div style={{ fontSize: 24, fontWeight: 500, lineHeight: '36px' }}>{cargando ? '—' : t.valor}</div>
              </Card>
            </Col>
          ))}
        </Row>

        <Panel titulo={`Más vendidos — ${mes}`} icono={<TrophyOutlined />}>
          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 3 }} /></div>
            : topItems.length === 0 ? <Empty style={{ padding: '24px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin ventas registradas este mes" />
            : (
              <Flex vertical gap={14} style={{ padding: 20 }}>
                {topItems.map(({ nombre, tipo, cantidad, monto }) => (
                  <div key={`${tipo}:${nombre}`}>
                    <Flex justify="space-between" align="center">
                      <Space size={6}>
                        {tipo === 'servicio' ? <MedicineBoxOutlined style={{ color: BRAND.primary }} /> : <ShoppingOutlined style={{ color: BRAND.accent }} />}
                        <Text strong>{nombre}</Text>
                      </Space>
                      <Text strong>{fmtMoneda(monto)}</Text>
                    </Flex>
                    <Progress percent={Math.round((monto / maxMonto) * 100)} showInfo={false} size="small"
                      strokeColor={tipo === 'servicio' ? BRAND.primary : BRAND.accent} />
                    <Text type="secondary" style={{ fontSize: 12 }}>{cantidad} {tipo === 'servicio' ? 'atenciones' : 'unidades'}</Text>
                  </div>
                ))}
              </Flex>
            )}
        </Panel>

        <Panel titulo="Historial de ventas" icono={<FileTextOutlined />} accion={<Tag>{ventas.length}</Tag>}>
          <Flex gap={8} wrap align="center" style={{ padding: '12px 20px' }}>
            <Text type="secondary">Del</Text>
            <Input type="date" value={rango.desde} aria-label="Desde" style={{ width: 150 }}
              onChange={e => cargarRango({ ...rango, desde: e.target.value })} />
            <Text type="secondary">al</Text>
            <Input type="date" value={rango.hasta} aria-label="Hasta" style={{ width: 150 }}
              onChange={e => cargarRango({ ...rango, hasta: e.target.value })} />
            {hayRango && <Button type="link" onClick={() => cargarRango({ desde: '', hasta: '' })}>Limpiar</Button>}
            <Space style={{ marginLeft: 'auto' }} wrap>
              <Button icon={<FilePdfOutlined />} disabled={ventas.length === 0} onClick={() => reporteVentasPDF(ventas, rango)}>Reporte PDF</Button>
              <Button icon={<DownloadOutlined />} disabled={ventas.length === 0} onClick={exportarVentas}>Excel</Button>
            </Space>
          </Flex>

          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 6 }} /></div> : (
            <Table<Venta> rowKey="id" size="middle" columns={columnas} dataSource={ventas}
              rowClassName={v => (v.anulada ? 'fila-inactiva' : '')}
              pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }} scroll={{ x: 'max-content' }}
              locale={{
                emptyText: (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={hayRango ? 'No hay ventas en esas fechas' : 'Aún no hay ventas registradas'}>
                    {!hayRango && <Button type="primary" icon={<PlusOutlined />} onClick={abrirNueva}>Nueva venta</Button>}
                  </Empty>
                ),
              }} />
          )}
        </Panel>
      </Space>

      {posAbierto && (
        <PuntoDeVenta
          productos={productos} servicios={servicios} clienteInicialId={clienteInicial}
          onCerrar={() => setPosAbierto(false)}
          onRegistrada={async (venta, cliente) => {
            setPosAbierto(false)
            generarBoleta(venta, cliente)
            toast.success('Venta registrada')
            await cargar()
          }}
        />
      )}

      {anulando && (
        <AnularModal
          venta={anulando}
          onCerrar={() => setAnulando(null)}
          onAnulada={actualizada => {
            setVentas(prev => prev.map(x => x.id === actualizada.id ? actualizada : x))
            setAnulando(null)
          }}
        />
      )}
    </div>
  )
}
