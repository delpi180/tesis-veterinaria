import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Input, Row, Skeleton, Space, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BarChartOutlined, DollarOutlined, DownloadOutlined, SearchOutlined, ShoppingCartOutlined,
  ShoppingOutlined, TeamOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { Panel } from '../components/PanelLista'
import { BRAND } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

interface ItemTop { nombre: string; cantidad: number; monto: number }
interface AtencionDoctor { doctor: string; atenciones: number }
interface DatosReporte {
  desde: string
  hasta: string
  ingreso_total: number
  total_ventas: number
  top_productos: ItemTop[]
  top_servicios: ItemTop[]
  atenciones_por_doctor: AtencionDoctor[]
}

const fmtMoneda = (n: number | string) =>
  `S/ ${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

const dosDigitos = (n: number) => String(n).padStart(2, '0')
const hoyStr = () => { const d = new Date(); return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}` }
const inicioMesStr = () => { const d = new Date(); return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-01` }

const columnasTop = (primera: string): TableColumnsType<ItemTop> => [
  { title: primera, dataIndex: 'nombre', render: (n: string) => <Text strong>{n}</Text> },
  { title: 'Cant.', dataIndex: 'cantidad', align: 'center' },
  { title: 'Monto', dataIndex: 'monto', align: 'right', render: (m: number) => <Text strong>{fmtMoneda(m)}</Text> },
]

const columnasDoctor: TableColumnsType<AtencionDoctor> = [
  { title: 'Doctor', dataIndex: 'doctor', render: (n: string) => <Text strong>{n}</Text> },
  { title: 'Atenciones', dataIndex: 'atenciones', align: 'center' },
]

const SinDatos = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin datos en el periodo." />

export default function Reportes() {
  const [data, setData] = useState<DatosReporte | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtros, setFiltros] = useState({ desde: inicioMesStr(), hasta: hoyStr() })

  const cargar = useCallback(async (f: { desde: string; hasta: string }) => {
    setCargando(true)
    const p = new URLSearchParams()
    if (f.desde) p.set('desde', f.desde)
    if (f.hasta) p.set('hasta', f.hasta)
    try {
      setData(await api.get(`/api/dashboard/reportes?${p.toString()}`))
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  // Solo la primera vez: después se busca con el botón, no en cada cambio de fecha.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(filtros) }, [])

  const exportarCSV = () => {
    if (!data) return
    const lineas = ['Tipo,Nombre,Cantidad,Monto']
    data.top_productos.forEach(r => lineas.push(`Producto,"${r.nombre}",${r.cantidad},${r.monto}`))
    data.top_servicios.forEach(r => lineas.push(`Servicio,"${r.nombre}",${r.cantidad},${r.monto}`))
    data.atenciones_por_doctor.forEach(r => lineas.push(`Atencion,"${r.doctor}",${r.atenciones},`))
    const csv = '﻿' + lineas.join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `reporte_${data.desde}_a_${data.hasta}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const tarjetas: { titulo: string; valor: string | number; icono: ReactNode }[] = data ? [
    { titulo: 'Ingreso del periodo', valor: fmtMoneda(data.ingreso_total), icono: <DollarOutlined /> },
    { titulo: 'Ventas del periodo', valor: data.total_ventas, icono: <ShoppingCartOutlined /> },
  ] : []

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">Productos y servicios más vendidos y atenciones por doctor</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Reportes
          </Title>
        </Col>
        <Col>
          <Button icon={<DownloadOutlined />} disabled={!data} onClick={exportarCSV}>Exportar</Button>
        </Col>
      </Row>

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Card className="tarjeta-viva animar" styles={{ body: { padding: '12px 20px' } }}>
          <Flex gap={10} wrap align="center">
            <Text strong>Periodo:</Text>
            <Input type="date" value={filtros.desde} max={filtros.hasta || undefined} aria-label="Desde" style={{ width: 160 }}
              onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
            <Text type="secondary">al</Text>
            <Input type="date" value={filtros.hasta} min={filtros.desde || undefined} aria-label="Hasta" style={{ width: 160 }}
              onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
            <Button type="primary" icon={<SearchOutlined />} loading={cargando} onClick={() => cargar(filtros)}>Buscar</Button>
          </Flex>
        </Card>

        {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => cargar(filtros)}>Reintentar</Button>} />}

        {cargando && !data ? <Card><Skeleton active paragraph={{ rows: 6 }} /></Card> : data && !error && (
          <>
            <Row gutter={[16, 16]}>
              {tarjetas.map((t, i) => (
                <Col key={t.titulo} xs={24} sm={12}>
                  <Card className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
                    <Flex justify="space-between" align="center">
                      <div>
                        <Text type="secondary">{t.titulo}</Text>
                        <div style={{ fontSize: 28, fontWeight: 500, lineHeight: '40px', color: BRAND.primary }}>{t.valor}</div>
                      </div>
                      <span style={{ fontSize: 32, color: BRAND.primary, opacity: 0.35 }}>{t.icono}</span>
                    </Flex>
                  </Card>
                </Col>
              ))}
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Panel titulo="Productos más vendidos" icono={<ShoppingOutlined />}>
                  <Table<ItemTop> rowKey="nombre" size="middle" pagination={false} columns={columnasTop('Producto')}
                    dataSource={data.top_productos} locale={{ emptyText: SinDatos }} scroll={{ x: 'max-content' }} />
                </Panel>
              </Col>
              <Col xs={24} lg={12}>
                <Panel titulo="Servicios más vendidos" icono={<BarChartOutlined />}>
                  <Table<ItemTop> rowKey="nombre" size="middle" pagination={false} columns={columnasTop('Servicio')}
                    dataSource={data.top_servicios} locale={{ emptyText: SinDatos }} scroll={{ x: 'max-content' }} />
                </Panel>
              </Col>
            </Row>

            <Panel titulo="Atenciones por doctor" icono={<TeamOutlined />}>
              <Table<AtencionDoctor> rowKey="doctor" size="middle" pagination={false} columns={columnasDoctor}
                dataSource={data.atenciones_por_doctor} locale={{ emptyText: SinDatos }} />
            </Panel>
          </>
        )}
      </Space>
    </div>
  )
}
