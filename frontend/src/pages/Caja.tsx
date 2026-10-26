import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Input, Row, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BankOutlined, CheckCircleOutlined, CreditCardOutlined, DollarOutlined, FilePdfOutlined,
  MobileOutlined, WalletOutlined, WarningOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { clinicaActual } from '../services/clinica'
import { calcularArqueo } from '../utils/dinero'
import { Panel } from '../components/PanelLista'
import { BRAND, ESTADO, PDF_MARCA } from '@src/core/color'
import { MEDIDAS } from '@src/core/medidas'

const { Title, Text } = Typography

const fmtMoneda = (n: number | string | null | undefined) =>
  `S/ ${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')

// Fecha local (YYYY-MM-DD): evita el desfase de toISOString(), que usa UTC
const fechaLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const METODO_INFO: Record<string, { label: string; icono: ReactNode }> = {
  efectivo: { label: 'Efectivo', icono: <DollarOutlined /> },
  tarjeta: { label: 'Tarjeta', icono: <CreditCardOutlined /> },
  yape: { label: 'Yape', icono: <MobileOutlined /> },
  plin: { label: 'Plin', icono: <MobileOutlined /> },
}
const nombreMetodo = (m: string) => METODO_INFO[m]?.label ?? m

interface Cierre {
  diferencia: number
  efectivo_esperado: number
  efectivo_contado: number
  cerrado_por: string
  cerrado_en?: string | null
  notas?: string | null
}
interface VentaCaja { id: number; hora: string; cliente: string; metodo_pago: string; total: number }
interface DatosCaja {
  fecha: string
  total: number
  num_ventas: number
  efectivo_esperado?: number
  cierre?: Cierre | null
  por_metodo: { metodo: string; cantidad: number; total: number }[]
  ventas: VentaCaja[]
}

const boleta = (id: number) => `B-${String(id).padStart(6, '0')}`

/**
 * Arqueo del día: cuánto efectivo hay realmente en el cajón.
 *
 * Lo que le da sentido a un cierre es comparar el conteo físico con lo que dice
 * el sistema y dejar constancia de quién cerró: con varias personas manejando
 * efectivo, eso protege tanto a la dueña como a quien contó la caja.
 */
function ArqueoCaja({ fecha, esperado, cierre, onCerrado }: {
  fecha: string
  esperado: number
  cierre?: Cierre | null
  onCerrado: () => void
}) {
  const toast = useToast()
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Diferencia en vivo, para que se vea antes de confirmar
  const arqueo = calcularArqueo(contado, esperado)
  const contadoNum = arqueo.contado
  const hayNumero = contadoNum !== null
  const diferencia = arqueo.diferencia

  const registrar = async () => {
    if (!hayNumero || contadoNum < 0) { toast.error('Escribe cuánto efectivo contaste en el cajón.'); return }
    if (diferencia !== 0 && !notas.trim()) {
      toast.error('La caja no cuadra: explica brevemente la diferencia antes de cerrar.')
      return
    }
    setGuardando(true)
    try {
      await api.post('/api/dashboard/cierre-caja', { fecha, efectivo_contado: contadoNum, notas: notas.trim() || null })
      toast.success('Caja cerrada.')
      setContado(''); setNotas('')
      onCerrado()
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  // Ya cerrada: se muestra el resultado, no el formulario
  if (cierre) {
    const dif = cierre.diferencia
    const cuadro = dif === 0
    return (
      <Alert
        className="tarjeta-viva animar"
        type={cuadro ? 'success' : 'warning'} showIcon
        icon={cuadro ? <CheckCircleOutlined /> : <WarningOutlined />}
        title={<Text strong>{cuadro ? 'Caja cerrada y cuadrada' : 'Caja cerrada con diferencia'}</Text>}
        description={
          <Flex vertical gap={4}>
            <span>
              Esperado <strong>{fmtMoneda(cierre.efectivo_esperado)}</strong>
              {' · '}Contado <strong>{fmtMoneda(cierre.efectivo_contado)}</strong>
              {!cuadro && (
                <>{' · '}<strong style={{ color: dif < 0 ? ESTADO.peligro : BRAND.primary }}>
                  {dif < 0 ? 'Faltó' : 'Sobró'} {fmtMoneda(Math.abs(dif))}
                </strong></>
              )}
            </span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Cerró {cierre.cerrado_por}{cierre.cerrado_en ? ` a las ${fmtHora(cierre.cerrado_en)}` : ''}
            </Text>
            {cierre.notas && <span><strong>Nota:</strong> {cierre.notas}</span>}
          </Flex>
        }
      />
    )
  }

  return (
    <Panel titulo="Arqueo de caja" icono={<DollarOutlined />}>
      <Flex vertical gap={14} style={{ padding: 20 }}>
        <Text type="secondary">
          Cuenta el efectivo del cajón y anótalo aquí. Solo se cuenta efectivo: lo cobrado por tarjeta, Yape o Plin no pasa por caja.
        </Text>

        <Flex wrap align="flex-end" gap={24}>
          <div>
            <Text type="secondary">Según el sistema</Text>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{fmtMoneda(esperado)}</div>
          </div>
          <Flex vertical gap={6}>
            <label htmlFor="caja-contado"><Text strong>Contado en el cajón</Text></label>
            <Input id="caja-contado" size="large" type="number" min={0} step="0.01" prefix="S/" placeholder="0.00"
              value={contado} onChange={e => setContado(e.target.value)} style={{ width: 170 }} />
          </Flex>
          {diferencia !== null && (
            <div>
              <Text type="secondary">Diferencia</Text>
              <div style={{ fontSize: 22, fontWeight: 500, color: diferencia === 0 ? ESTADO.ok : diferencia < 0 ? ESTADO.peligro : BRAND.primary }}>
                {diferencia === 0 ? 'Cuadra' : `${diferencia > 0 ? '+' : ''}${fmtMoneda(diferencia)}`}
              </div>
            </div>
          )}
        </Flex>

        {diferencia !== null && diferencia !== 0 && (
          <Flex vertical gap={6}>
            <label htmlFor="caja-notas"><Text strong>¿Por qué la diferencia? *</Text></label>
            <Input id="caja-notas" size="large" placeholder="Ej. se dio un vuelto de más en la mañana"
              value={notas} onChange={e => setNotas(e.target.value)} />
          </Flex>
        )}

        <Flex justify="space-between" align="center" gap={12} wrap>
          <Text type="secondary" style={{ fontSize: 12, maxWidth: 460 }}>
            Una vez cerrada, la caja de este día no se puede volver a cerrar ni se pueden anular sus ventas.
          </Text>
          <Button type="primary" size="large" loading={guardando} disabled={!hayNumero} onClick={registrar}>
            {guardando ? 'Cerrando…' : 'Cerrar caja del día'}
          </Button>
        </Flex>
      </Flex>
    </Panel>
  )
}

export default function Caja() {
  const toast = useToast()
  const hoy = fechaLocal()
  const [fecha, setFecha] = useState(hoy)
  const [data, setData] = useState<DatosCaja | null>(null)
  const [cargando, setCargando] = useState(true)

  // Se separa para poder recargar tras registrar el arqueo.
  const cargar = useCallback(async () => {
    try {
      setData(await api.get(`/api/dashboard/cierre-caja?fecha=${fecha}`))
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [fecha, toast])

  useEffect(() => { cargar() }, [cargar])

  const cambiarFecha = (f: string) => { if (f) { setCargando(true); setFecha(f) } }

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hoyLargo = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

  const exportarPDF = () => {
    if (!data) return
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const marca = PDF_MARCA
    doc.setFillColor(...marca); doc.rect(0, 0, 210, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(15); doc.setFont('helvetica', 'bold')
    doc.text(clinicaActual().nombre, 14, 11)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text(`Cierre de Caja — ${data.fecha}`, 14, 18)

    autoTable(doc, {
      startY: 30,
      head: [['Método de pago', 'N° ventas', 'Total']],
      body: data.por_metodo.map(m => [nombreMetodo(m.metodo), m.cantidad, fmtMoneda(m.total)]),
      foot: [['TOTAL', data.num_ventas, fmtMoneda(data.total)]],
      headStyles: { fillColor: marca, fontSize: 9 },
      footStyles: { fillColor: [238, 246, 243], textColor: marca, fontStyle: 'bold' },
      styles: { fontSize: 9 }, margin: { left: 14, right: 14 },
    })
    if (data.ventas.length) {
      const fin = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
      autoTable(doc, {
        startY: fin + 5,
        head: [['Boleta', 'Hora', 'Cliente', 'Método', 'Total']],
        body: data.ventas.map(v => [boleta(v.id), fmtHora(v.hora), v.cliente, nombreMetodo(v.metodo_pago), fmtMoneda(v.total)]),
        headStyles: { fillColor: marca, fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2 }, margin: { left: 14, right: 14 },
      })
    }
    doc.save(`CierreCaja_${data.fecha}.pdf`)
    toast.success('Reporte de caja descargado')
  }

  const columnas: TableColumnsType<VentaCaja> = [
    { title: 'Boleta', dataIndex: 'id', render: (id: number) => <Text code>{boleta(id)}</Text> },
    { title: 'Hora', dataIndex: 'hora', render: (h: string) => fmtHora(h) },
    { title: 'Cliente', dataIndex: 'cliente', render: (c: string) => <Text strong>{c}</Text> },
    { title: 'Método', dataIndex: 'metodo_pago', render: (m: string) => <Tag style={{ marginInlineEnd: 0 }}>{nombreMetodo(m)}</Tag> },
    { title: 'Total', dataIndex: 'total', align: 'right', render: (t: number) => <Text strong>{fmtMoneda(t)}</Text> },
  ]

  return (
    <div className="animar" style={{ flex: 1, minWidth: 0, padding: '16px 32px 32px', width: '100%' }}>
      <Row justify="space-between" align="bottom" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col flex="auto">
          <Text type="secondary">{hoyLargo}</Text>
          <Title level={2} style={{ margin: '4px 0 0', fontSize: MEDIDAS.tituloSeccion, fontWeight: 500, lineHeight: '32px' }}>
            Cierre de caja
          </Title>
        </Col>
        <Col>
          <Space wrap>
            <Input type="date" value={fecha} max={hoy} aria-label="Fecha de la caja" onChange={e => cambiarFecha(e.target.value)} />
            <Button type="primary" icon={<FilePdfOutlined />} disabled={!data || data.num_ventas === 0} onClick={exportarPDF}>
              Exportar PDF
            </Button>
          </Space>
        </Col>
      </Row>

      {cargando || !data ? <Card><Skeleton active paragraph={{ rows: 6 }} /></Card> : (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          {/* Total del día */}
          <Card className="tarjeta-viva animar" style={{ background: BRAND.primary, border: 'none' }}>
            <Flex justify="space-between" align="center" gap={16} wrap>
              <Flex gap={16} align="center">
                <div style={{ fontSize: 26, color: '#fff', background: 'rgba(255,255,255,.15)', width: 52, height: 52, borderRadius: 12, display: 'grid', placeItems: 'center' }}>
                  <WalletOutlined />
                </div>
                <div style={{ color: '#fff' }}>
                  <div style={{ opacity: 0.8 }}>Total recaudado</div>
                  <div style={{ fontSize: 30, fontWeight: 500, lineHeight: '38px' }}>{fmtMoneda(data.total)}</div>
                </div>
              </Flex>
              <div style={{ color: '#fff', textAlign: 'right' }}>
                <div style={{ opacity: 0.8 }}>Ventas del día</div>
                <div style={{ fontSize: 26, fontWeight: 500 }}>{data.num_ventas}</div>
              </div>
            </Flex>
          </Card>

          {/* Desglose por método */}
          <Row gutter={[16, 16]}>
            {data.por_metodo.map((m, i) => (
              <Col key={m.metodo} xs={12} md={6}>
                <Card className="tarjeta-viva animar" style={{ animationDelay: `${i * 70}ms` }}>
                  <Flex justify="space-between" align="center">
                    <Text type="secondary">{nombreMetodo(m.metodo)}</Text>
                    <span style={{ color: BRAND.primary }}>{METODO_INFO[m.metodo]?.icono ?? <BankOutlined />}</span>
                  </Flex>
                  <div style={{ fontSize: 22, fontWeight: 500, lineHeight: '32px' }}>{fmtMoneda(m.total)}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{m.cantidad} venta{m.cantidad !== 1 ? 's' : ''}</Text>
                </Card>
              </Col>
            ))}
          </Row>

          {/* Arqueo: contar el efectivo del cajón. Es lo que convierte este reporte en un cierre de verdad. */}
          <ArqueoCaja key={fecha} fecha={fecha} esperado={data.efectivo_esperado ?? 0} cierre={data.cierre} onCerrado={cargar} />

          <Panel titulo="Ventas del día" icono={<WalletOutlined />}>
            <Table<VentaCaja> rowKey="id" size="middle" columns={columnas} dataSource={data.ventas}
              pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }} scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Sin ventas registradas el ${data.fecha}`} /> }} />
          </Panel>
        </Space>
      )}
    </div>
  )
}
