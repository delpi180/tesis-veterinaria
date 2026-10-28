import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Input, Row, Select, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CalendarOutlined, DeleteOutlined, DollarOutlined, DownloadOutlined, EditOutlined, InboxOutlined,
  PlusOutlined, SearchOutlined, ShoppingCartOutlined, SwapOutlined, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { exportarCSV } from '../utils/exportUtils'
import { Panel } from '../components/PanelLista'
import KardexModal from '../components/inventario/KardexModal'
import EntradaIAModal from '../components/inventario/EntradaIAModal'
import ProductoModal from '../components/inventario/ProductoModal'
import {
  CAT_COLOR, CAT_LABEL, OPCIONES_CATEGORIA, fmtFecha, fmtMoneda, mensajeDe, type Producto,
} from '../components/inventario/tipos'
import { BRAND, ESTADO } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

interface Reposicion {
  id: number; codigo?: string | null; nombre: string; proveedor?: string | null; unidad?: string | null
  stock: number; consumo_diario: number; dias_restantes: number; sugerido: number; urgente: boolean
}

/** Aviso de caducidad. No muestra nada si el producto no lleva fecha o le falta
 *  más de un mes: avisar de todo es lo mismo que no avisar de nada. */
function EtiquetaVencimiento({ p }: { p: Producto }) {
  const estado = p.estado_vencimiento
  if (!estado || estado === 'vigente' || !p.fecha_vencimiento) return null
  const dias = p.dias_para_vencer ?? 0
  const vencido = estado === 'vencido'
  const texto = vencido
    ? `Vencido ${fmtFecha(p.fecha_vencimiento)}`
    : dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`
  return (
    <Tooltip title={p.lote ? `Lote ${p.lote}` : undefined}>
      <Tag color={vencido ? 'error' : 'warning'} icon={<WarningOutlined />} style={{ marginTop: 4 }}>{texto}</Tag>
    </Tooltip>
  )
}

export default function Inventario() {
  const confirmar = useConfirmar()
  const toast = useToast()
  const [productos, setProductos] = useState<Producto[]>([])
  const [reposicion, setReposicion] = useState<Reposicion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [fCategoria, setFCategoria] = useState<string | undefined>()
  const [fEstado, setFEstado] = useState<string | undefined>()   // en_stock | bajo_stock | inactivo

  // Modales: `editando` solo vale cuando el de producto está abierto (null = nuevo).
  const [productoAbierto, setProductoAbierto] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [kardex, setKardex] = useState<Producto | null>(null)
  const [entradaIA, setEntradaIA] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      // solo_activos=false → mostramos también los desactivados en el catálogo
      const data = await api.get('/api/productos/?solo_activos=false')
      setProductos(Array.isArray(data) ? data : [])
      // La predicción es un extra: si falla, el catálogo sigue funcionando
      api.get('/api/productos/reposicion').then(r => setReposicion(Array.isArray(r) ? r : [])).catch(() => setReposicion([]))
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const term = busqueda.trim().toLowerCase()
  const filtrados = productos.filter(p => {
    if (term &&
        !p.nombre.toLowerCase().includes(term) &&
        !(p.codigo ?? '').toLowerCase().includes(term) &&
        !(p.proveedor ?? '').toLowerCase().includes(term)) return false
    if (fCategoria && p.categoria !== fCategoria) return false
    if (fEstado === 'en_stock' && (!p.activo || p.stock_bajo)) return false
    if (fEstado === 'bajo_stock' && !(p.activo && p.stock_bajo)) return false
    if (fEstado === 'inactivo' && p.activo) return false
    return true
  })
  const hayFiltros = !!(term || fCategoria || fEstado)
  const limpiarFiltros = () => { setBusqueda(''); setFCategoria(undefined); setFEstado(undefined) }

  const exportar = () => {
    if (filtrados.length === 0) { toast.error('No hay productos para exportar.'); return }
    exportarCSV(
      'Inventario',
      ['Código', 'Producto', 'Categoría', 'Proveedor', 'Stock', 'Stock mínimo', 'Precio', 'Valor', 'Estado'],
      filtrados.map(p => [
        p.codigo ?? '', p.nombre, CAT_LABEL[p.categoria ?? ''] ?? p.categoria ?? '',
        p.proveedor ?? '', p.stock, p.stock_minimo,
        Number(p.precio).toFixed(2), Number(p.valor_stock ?? p.stock * Number(p.precio)).toFixed(2),
        !p.activo ? 'Inactivo' : p.stock_bajo ? 'Bajo stock' : 'En stock',
      ]),
    )
    toast.success(`${filtrados.length} producto(s) exportado(s).`)
  }

  // Pedido listo para mandar: agrupado por proveedor, para llamar a cada uno una sola vez
  const exportarPedido = () => {
    const filas = [...reposicion].sort((a, b) => (a.proveedor ?? 'zzz').localeCompare(b.proveedor ?? 'zzz'))
    exportarCSV('Pedido sugerido', ['Proveedor', 'Código', 'Producto', 'Stock', 'Se vende por día', 'Alcanza (días)', 'Pedir'],
      filas.map(r => [r.proveedor ?? 'Sin proveedor', r.codigo ?? '', r.nombre, r.stock, r.consumo_diario, r.dias_restantes, r.sugerido]))
    toast.success(`Pedido de ${filas.length} producto(s) exportado.`)
  }

  // Indicadores (datos reales)
  const bajoStock = productos.filter(p => p.activo && p.stock_bajo).length
  const valorTotal = productos.reduce((s, p) => s + p.stock * Number(p.precio), 0)
  // Sin stock no hay nada que retirar de la estantería, así que no se avisa
  const caducando = productos
    .filter(p => p.activo && p.stock > 0 && (p.estado_vencimiento === 'vencido' || p.estado_vencimiento === 'por_vencer'))
    .sort((a, b) => (a.dias_para_vencer ?? 0) - (b.dias_para_vencer ?? 0))
  const vencidos = caducando.filter(p => p.estado_vencimiento === 'vencido')

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  const abrirNuevo = () => { setEditando(null); setProductoAbierto(true) }
  const abrirEditar = (p: Producto) => { setEditando(p); setProductoAbierto(true) }

  const eliminar = async (p: Producto) => {
    if (!await confirmar({
      titulo: 'Eliminar producto',
      mensaje: `Se quitará "${p.nombre}" (${p.codigo}) del inventario.`,
      detalle: 'Si el producto ya tiene ventas registradas el sistema no dejará borrarlo; en ese caso desactívalo para sacarlo del catálogo sin perder el historial.',
      confirmarTexto: 'Eliminar',
    })) return
    try {
      await api.del(`/api/productos/${p.id}`)
      setProductos(prev => prev.filter(x => x.id !== p.id))
      toast.success('Producto eliminado')
    } catch (e) {
      toast.error(mensajeDe(e))
    }
  }

  const columnas: TableColumnsType<Producto> = [
    { title: 'Código', dataIndex: 'codigo', width: 110, render: (c?: string | null) => <Text code>{c ?? '—'}</Text> },
    {
      title: 'Producto', key: 'nombre',
      render: (_, p) => (
        <div>
          <Text strong>{p.nombre}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{[p.unidad, `Mín: ${p.stock_minimo}`].filter(Boolean).join(' · ')}</Text>
          <div><EtiquetaVencimiento p={p} /></div>
        </div>
      ),
    },
    {
      title: 'Categoría', dataIndex: 'categoria',
      render: (c?: string | null) => c ? <Tag color={CAT_COLOR[c]} style={{ marginInlineEnd: 0 }}>{CAT_LABEL[c] ?? c}</Tag> : '—',
    },
    { title: 'Proveedor', dataIndex: 'proveedor', render: (v?: string | null) => v || '—' },
    {
      title: 'Stock', dataIndex: 'stock', align: 'center',
      render: (s: number, p) => <Text strong style={{ color: p.stock_bajo ? ESTADO.peligro : undefined }}>{s}</Text>,
    },
    { title: 'Precio', dataIndex: 'precio', align: 'right', render: (v: number | string) => <Text strong>{fmtMoneda(v)}</Text> },
    {
      title: 'Valor', key: 'valor', align: 'right',
      render: (_, p) => <Text type="secondary">{fmtMoneda(p.valor_stock ?? p.stock * Number(p.precio))}</Text>,
    },
    {
      title: 'Estado', key: 'estado', align: 'center',
      render: (_, p) => !p.activo
        ? <Tag style={{ marginInlineEnd: 0 }}>Inactivo</Tag>
        : p.stock_bajo
          ? <Tag color="error" icon={<WarningOutlined />} style={{ marginInlineEnd: 0 }}>Bajo stock</Tag>
          : <Tag color="success" style={{ marginInlineEnd: 0 }}>En stock</Tag>,
    },
    {
      title: '', key: 'acciones', align: 'right', width: 130,
      render: (_, p) => (
        <Space size={4}>
          <Tooltip title="Kardex / ajustar stock"><Button type="text" icon={<SwapOutlined />} aria-label="Kardex y ajuste de stock" onClick={() => setKardex(p)} /></Tooltip>
          <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} aria-label="Editar producto" onClick={() => abrirEditar(p)} /></Tooltip>
          <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} aria-label="Eliminar producto" onClick={() => eliminar(p)} /></Tooltip>
        </Space>
      ),
    },
  ]

  const tarjetas = [
    { titulo: 'Total productos', valor: String(productos.length), icono: <InboxOutlined />, color: BRAND.primary },
    { titulo: 'Bajo stock', valor: String(bajoStock), icono: <WarningOutlined />, color: bajoStock ? ESTADO.peligro : BRAND.primary, nota: bajoStock ? 'Requieren reposición' : undefined },
    { titulo: 'Valor en inventario', valor: fmtMoneda(valorTotal), icono: <DollarOutlined />, color: BRAND.primary },
  ]

  const sinProductos = !cargando && !error && productos.length === 0

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoy}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Inventario y productos
          </Title>
        </Col>
        <Col>
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={exportar}>Excel</Button>
            <Button icon={<ThunderboltOutlined />} onClick={() => setEntradaIA(true)}>Entrada por voz o texto</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirNuevo}>Nuevo producto</Button>
          </Space>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={`No se pudo conectar con el servidor: ${error}`} action={<Button size="small" onClick={cargar}>Reintentar</Button>} />}

        {caducando.length > 0 && (
          <Alert
            type={vencidos.length ? 'error' : 'warning'} showIcon icon={<CalendarOutlined />}
            title={vencidos.length > 0
              ? `${vencidos.length} producto(s) vencido(s) — retíralos de la venta`
              : `${caducando.length} producto(s) vencen en menos de 30 días`}
            description={
              <Flex wrap gap="4px 16px">
                {caducando.slice(0, 8).map(p => (
                  <span key={p.id}>
                    <strong>{p.nombre}</strong>{p.lote ? ` (lote ${p.lote})` : ''} — {p.fecha_vencimiento ? fmtFecha(p.fecha_vencimiento) : ''} · {p.stock} en stock
                  </span>
                ))}
                {caducando.length > 8 && <span>y {caducando.length - 8} más…</span>}
              </Flex>
            }
          />
        )}

        <Row gutter={[16, 16]}>
          {tarjetas.map((t, i) => (
            <Col key={t.titulo} xs={24} md={8}>
              <Card className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
                <Flex gap={14} align="center">
                  <div style={{ fontSize: 22, color: t.color, background: BRAND.panel, width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center' }}>{t.icono}</div>
                  <div>
                    <Text type="secondary">{t.titulo}</Text>
                    <div style={{ fontSize: 24, fontWeight: 500, color: t.color, lineHeight: '32px' }}>{t.valor}</div>
                    {t.nota && <Text type="secondary" style={{ fontSize: 12 }}>{t.nota}</Text>}
                  </div>
                </Flex>
              </Card>
            </Col>
          ))}
        </Row>

        {reposicion.length > 0 && (
          <Panel titulo={`Para pedir al proveedor (${reposicion.length})`} icono={<ShoppingCartOutlined style={{ color: ESTADO.atencion }} />}
            accion={<Button size="small" icon={<DownloadOutlined />} onClick={exportarPedido}>Pedido</Button>}>
            <Table<Reposicion> rowKey="id" size="small" pagination={false} dataSource={reposicion.slice(0, 8)}
              columns={[
                { title: 'Producto', dataIndex: 'nombre', render: (n: string, r) => <><Text strong>{n}</Text> <Text type="secondary" style={{ fontSize: 12 }}>{r.proveedor ?? ''}</Text></> },
                { title: 'Stock', dataIndex: 'stock', width: 80, align: 'right' },
                { title: 'Se vende', dataIndex: 'consumo_diario', width: 110, align: 'right', render: (c: number) => `${c} por día` },
                { title: 'Alcanza', dataIndex: 'dias_restantes', width: 110, render: (d: number, r) => <Tag color={r.urgente ? 'error' : 'warning'} style={{ margin: 0 }}>{d < 1 ? 'se acaba hoy' : `${Math.floor(d)} día${Math.floor(d) === 1 ? '' : 's'}`}</Tag> },
                { title: 'Pedir', dataIndex: 'sugerido', width: 80, align: 'right', render: (n: number) => <Text strong>{n}</Text> },
              ]} />
            {reposicion.length > 8 && <div style={{ padding: '8px 20px' }}><Text type="secondary">y {reposicion.length - 8} más en el pedido exportado</Text></div>}
          </Panel>
        )}

        <Panel titulo="Catálogo" icono={<InboxOutlined />}
          accion={<Tag>{filtrados.length}{hayFiltros ? ` de ${productos.length}` : ''}</Tag>}>
          {!sinProductos && (
            <Flex gap={8} wrap align="center" style={{ padding: '12px 20px' }}>
              <Input allowClear prefix={<SearchOutlined />} placeholder="Buscar nombre, código o proveedor…" aria-label="Buscar producto"
                value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ width: 280 }} />
              <Select allowClear placeholder="Todas las categorías" value={fCategoria} onChange={setFCategoria}
                options={OPCIONES_CATEGORIA} style={{ width: 190 }} aria-label="Categoría" />
              <Select allowClear placeholder="Cualquier estado" value={fEstado} onChange={setFEstado} style={{ width: 170 }} aria-label="Estado"
                options={[{ value: 'en_stock', label: 'En stock' }, { value: 'bajo_stock', label: 'Bajo stock' }, { value: 'inactivo', label: 'Inactivos' }]} />
              {hayFiltros && <Button type="link" onClick={limpiarFiltros}>Limpiar filtros</Button>}
            </Flex>
          )}

          {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
            : sinProductos ? (
              /* Al arrancar la clínica esta es la primera pantalla que ven: la acción va aquí. */
              <Empty style={{ padding: '40px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Aún no hay productos en el inventario. Cárgalos uno por uno, o dicta la lista completa de una vez.">
                <Space wrap>
                  <Button type="primary" icon={<PlusOutlined />} onClick={abrirNuevo}>Nuevo producto</Button>
                  <Button icon={<ThunderboltOutlined />} onClick={() => setEntradaIA(true)}>Entrada por voz o texto</Button>
                </Space>
              </Empty>
            ) : (
              <Table<Producto> rowKey="id" size="middle" columns={columnas} dataSource={filtrados}
                rowClassName={p => (p.activo ? '' : 'fila-inactiva')}
                pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ningún producto coincide con los filtros"><Button onClick={limpiarFiltros}>Limpiar filtros</Button></Empty> }} />
            )}
        </Panel>
      </Space>

      {productoAbierto && (
        <ProductoModal
          producto={editando}
          onCerrar={() => setProductoAbierto(false)}
          onGuardado={async () => { await cargar(); setProductoAbierto(false) }}
        />
      )}

      {kardex && (
        <KardexModal
          producto={kardex}
          onCerrar={() => setKardex(null)}
          onStockCambiado={actualizado => {
            setProductos(prev => prev.map(x => x.id === actualizado.id ? actualizado : x))
            setKardex(actualizado)
          }}
        />
      )}

      {entradaIA && (
        <EntradaIAModal
          onCerrar={() => setEntradaIA(false)}
          onAplicado={() => { setEntradaIA(false); cargar() }}
        />
      )}
    </div>
  )
}
