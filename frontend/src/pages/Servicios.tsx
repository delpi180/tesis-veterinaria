import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Input, Row, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, DeleteOutlined, EditOutlined, MedicineBoxOutlined, PlusOutlined, SearchOutlined,
  TagOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { Panel } from '../components/PanelLista'
import ServicioModal, { type Servicio } from '../components/servicios/ServicioModal'
import ServiciosIAModal from '../components/servicios/ServiciosIAModal'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

const fmtMoneda = (n: number | string | null | undefined) =>
  `S/ ${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

export default function Servicios() {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  // Modales: `editando` solo vale cuando el de servicio está abierto (null = nuevo).
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState<Servicio | null>(null)
  const [voz, setVoz] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      // solo_activos=false → mostramos también los desactivados en el catálogo
      const data = await api.get('/api/servicios/?solo_activos=false')
      setServicios(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const term = busqueda.trim().toLowerCase()
  const filtrados = term
    ? servicios.filter(s => s.nombre.toLowerCase().includes(term) || (s.descripcion ?? '').toLowerCase().includes(term))
    : servicios
  const totalActivos = servicios.filter(s => s.activo).length

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  const abrirNuevo = () => { setEditando(null); setModalAbierto(true) }
  const abrirEditar = (s: Servicio) => { setEditando(s); setModalAbierto(true) }

  const eliminar = async (s: Servicio) => {
    if (!await confirmar({
      titulo: 'Eliminar servicio',
      mensaje: `Se quitará "${s.nombre}" del catálogo.`,
      detalle: 'Si ya se cobró alguna vez el sistema no dejará borrarlo; desactívalo para dejar de ofrecerlo sin perder el historial de ventas.',
      confirmarTexto: 'Eliminar',
    })) return
    try {
      await api.del(`/api/servicios/${s.id}`)
      setServicios(prev => prev.filter(x => x.id !== s.id))
      toast.success('Servicio eliminado')
    } catch (e) {
      toast.error(mensajeDe(e))
    }
  }

  const columnas: TableColumnsType<Servicio> = [
    { title: 'Servicio', dataIndex: 'nombre', render: (n: string) => <Text strong>{n}</Text> },
    { title: 'Descripción', dataIndex: 'descripcion', render: (d?: string | null) => <Text type="secondary">{d || '—'}</Text> },
    {
      title: 'Precio', key: 'precio', align: 'right',
      render: (_, s) => s.precio_variable
        ? <Tag color="blue" icon={<TagOutlined />} style={{ marginInlineEnd: 0 }}>Monto variable</Tag>
        : <Text strong>{fmtMoneda(s.precio)}</Text>,
    },
    {
      title: 'Estado', dataIndex: 'activo', align: 'center',
      render: (a: boolean) => <Tag color={a ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>{a ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: '', key: 'acciones', align: 'right', width: 100,
      render: (_, s) => (
        <Space size={4}>
          <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} aria-label="Editar servicio" onClick={() => abrirEditar(s)} /></Tooltip>
          <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} aria-label="Eliminar servicio" onClick={() => eliminar(s)} /></Tooltip>
        </Space>
      ),
    },
  ]

  const tarjetas = [
    { titulo: 'Servicios registrados', valor: servicios.length, icono: <MedicineBoxOutlined /> },
    { titulo: 'Activos (disponibles para venta)', valor: totalActivos, icono: <CheckCircleOutlined /> },
  ]
  const sinServicios = !cargando && !error && servicios.length === 0

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Servicios
          </Title>
        </Col>
        <Col>
          <Space wrap>
            <Button icon={<ThunderboltOutlined />} onClick={() => setVoz(true)}>Por voz o texto</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirNuevo}>Nuevo servicio</Button>
          </Space>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={`No se pudo conectar con el servidor: ${error}`} action={<Button size="small" onClick={cargar}>Reintentar</Button>} />}

        <Row gutter={[16, 16]}>
          {tarjetas.map((t, i) => (
            <Col key={t.titulo} xs={24} md={12}>
              <Card className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
                <Flex gap={14} align="center">
                  <div style={{ fontSize: 22, color: BRAND.primary, background: BRAND.panel, width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center' }}>{t.icono}</div>
                  <div>
                    <Text type="secondary">{t.titulo}</Text>
                    <div style={{ fontSize: 26, fontWeight: 500, lineHeight: '34px' }}>{cargando ? '—' : t.valor}</div>
                  </div>
                </Flex>
              </Card>
            </Col>
          ))}
        </Row>

        <Panel titulo="Catálogo de servicios" icono={<MedicineBoxOutlined />}
          accion={<Tag>{filtrados.length}{term ? ` de ${servicios.length}` : ''}</Tag>}>
          {!sinServicios && (
            <div style={{ padding: '12px 20px' }}>
              <Input allowClear prefix={<SearchOutlined />} placeholder="Buscar servicio…" aria-label="Buscar servicio"
                value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ maxWidth: 320 }} />
            </div>
          )}

          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 5 }} /></div>
            : sinServicios ? (
              <Empty style={{ padding: '40px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Aún no hay servicios en el catálogo. Son las prestaciones que se cobran: consulta, vacunación, baño, cirugía…">
                <Space wrap>
                  <Button type="primary" icon={<PlusOutlined />} onClick={abrirNuevo}>Nuevo servicio</Button>
                  <Button icon={<ThunderboltOutlined />} onClick={() => setVoz(true)}>Por voz o texto</Button>
                </Space>
              </Empty>
            ) : (
              <Table<Servicio> rowKey="id" size="middle" columns={columnas} dataSource={filtrados}
                rowClassName={s => (s.activo ? '' : 'fila-inactiva')}
                pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }} scroll={{ x: 'max-content' }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No se encontraron servicios para "${busqueda}"`} /> }} />
            )}
        </Panel>
      </Space>

      {modalAbierto && (
        <ServicioModal servicio={editando} onCerrar={() => setModalAbierto(false)}
          onGuardado={async () => { await cargar(); setModalAbierto(false) }} />
      )}
      {voz && <ServiciosIAModal onCerrar={() => setVoz(false)} onAplicado={() => { setVoz(false); cargar() }} />}
    </div>
  )
}
