import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Col, DatePicker, Empty, Flex, Form, Input, Row, Skeleton, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { CloseOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, MedicineBoxOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons'
import { api, esVeterinario } from '../services/api'
import { useToast } from './Toast'
import { useConfirmar } from './Confirmar'
import { nombresSimilares } from '../utils/similitud'
import VoiceTextProcessor from './VoiceTextProcessor'
import ItemsEditor, { ITEM_VACIO } from './recetas/ItemsEditor'
import { descargarPDF, enviarReceta, fmtFecha } from './recetas/pdfReceta'
import type { ClienteReceta, ItemReceta, PacienteReceta, Receta } from './recetas/pdfReceta'
import { BRAND } from '@src/core/color'

const { Text } = Typography

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')
const hoyStr = () => dayjs().format('YYYY-MM-DD')
const fmtFechaHora = (iso?: string | null) => iso ? new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—'

interface FormReceta { fecha: string; diagnostico: string; indicaciones: string; items: ItemReceta[] }
const formInicial = (): FormReceta => ({ fecha: hoyStr(), diagnostico: '', indicaciones: '', items: [{ ...ITEM_VACIO }] })

// Si el veterinario ya tenía datos cargados (por ejemplo, está editando una
// receta existente y dicta un ajuste), el dictado FUSIONA en vez de reemplazar:
// un medicamento ya en la lista se actualiza por nombre similar (no se duplica);
// el texto de diagnóstico/indicaciones se completa o se amplía, sin repetir.
const fusionarTexto = (actual: string, nuevo?: string) => {
  const previo = (actual || '').trim()
  const entrante = (nuevo || '').trim()
  if (!entrante) return previo
  if (!previo) return entrante
  if (previo.toLowerCase().includes(entrante.toLowerCase())) return previo
  return `${previo}. ${entrante}`
}

export default function RecetasPaciente({ pacienteId, paciente, cliente }: {
  pacienteId: number | string
  paciente?: PacienteReceta
  cliente?: ClienteReceta
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const puedeEscribir = esVeterinario()
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [cargando, setCargando] = useState(true)
  const [formAbierto, setFormAbierto] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<FormReceta>(formInicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviandoId, setEnviandoId] = useState<number | null>(null)   // receta que se está compartiendo
  const guardandoRef = useRef(false)   // guard extra contra doble envío (doble clic, Enter repetido)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setRecetas(await api.get(`/api/pacientes/${pacienteId}/recetas/`))
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [pacienteId, toast])
  useEffect(() => { if (pacienteId) cargar() }, [pacienteId, cargar])

  const handleEnviar = async (r: Receta) => {
    setEnviandoId(r.id)
    try { await enviarReceta(paciente, cliente, r, toast) } catch (e) { toast.error(mensajeDe(e)) } finally { setEnviandoId(null) }
  }

  const abrirNueva = () => { setEditId(null); setForm(formInicial()); setError(null); setFormAbierto(true) }
  const abrirEditar = (r: Receta) => {
    setEditId(r.id)
    setForm({
      fecha: r.fecha, diagnostico: r.diagnostico ?? '', indicaciones: r.indicaciones ?? '',
      items: r.items?.length ? r.items.map(i => ({ ...ITEM_VACIO, ...i })) : [{ ...ITEM_VACIO }],
    })
    setError(null); setFormAbierto(true)
  }
  const cerrarForm = () => { setFormAbierto(false); setEditId(null); setForm(formInicial()); setError(null) }

  const applyDictado = ({ diagnostico, indicaciones, items }: { diagnostico?: string; indicaciones?: string; items?: ItemReceta[] }) => {
    setForm(prev => {
      const itemsPrevios = prev.items.filter(i => i.medicamento.trim())
      const itemsFusionados = [...itemsPrevios]
      // Solo se fusiona contra lo que YA estaba escrito, no contra lo que este
      // mismo dictado acaba de agregar: una receta puede llevar dos pautas del
      // mismo fármaco ("inyectable hoy y tabletas por 7 días") y buscar en toda
      // la lista las colapsaba en una, borrando una indicación.
      const nPrevias = itemsPrevios.length
      ;(items || []).forEach(nuevo => {
        if (!nuevo.medicamento?.trim()) return
        const idx = itemsFusionados.findIndex((i, k) => k < nPrevias && nombresSimilares(i.medicamento, nuevo.medicamento))
        if (idx > -1) {
          itemsFusionados[idx] = {
            medicamento: nuevo.medicamento || itemsFusionados[idx].medicamento,
            dosis: nuevo.dosis || itemsFusionados[idx].dosis,
            via: nuevo.via || itemsFusionados[idx].via,
            frecuencia: nuevo.frecuencia || itemsFusionados[idx].frecuencia,
            duracion: nuevo.duracion || itemsFusionados[idx].duracion,
            dicho: nuevo.dicho || itemsFusionados[idx].dicho,
            // El aviso de "no está en tu inventario" viene del backend y se arma
            // campo por campo: sin esto se perdería justo al fusionar.
            en_catalogo: nuevo.en_catalogo,
          }
        } else {
          itemsFusionados.push({ ...ITEM_VACIO, ...nuevo })
        }
      })
      return {
        ...prev,
        diagnostico: fusionarTexto(prev.diagnostico, diagnostico),
        indicaciones: fusionarTexto(prev.indicaciones, indicaciones),
        items: itemsFusionados.length ? itemsFusionados : [{ ...ITEM_VACIO }],
      }
    })
  }

  const guardar = async () => {
    if (guardandoRef.current) return
    const items = form.items.filter(i => i.medicamento.trim())
    if (items.length === 0) { setError('Agrega al menos un medicamento.'); return }
    guardandoRef.current = true
    setGuardando(true); setError(null)
    try {
      const payload = { fecha: form.fecha, diagnostico: form.diagnostico.trim() || null, indicaciones: form.indicaciones.trim() || null, items }
      if (editId) {
        const actualizada = await api.put(`/api/pacientes/${pacienteId}/recetas/${editId}`, payload)
        setRecetas(prev => prev.map(r => r.id === editId ? actualizada : r))
        toast.success('Receta actualizada.')
      } else {
        const nueva = await api.post(`/api/pacientes/${pacienteId}/recetas/`, payload)
        setRecetas(prev => [nueva, ...prev])
        toast.success('Receta guardada.')
      }
      cerrarForm()
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const eliminar = async (r: Receta) => {
    if (!await confirmar({
      titulo: 'Eliminar receta',
      mensaje: `Se borrará la receta del ${fmtFecha(r.fecha)}.`,
      detalle: 'No se puede deshacer. Si ya se le entregó al cliente, conviene conservarla como constancia de lo que se indicó.',
      confirmarTexto: 'Eliminar receta',
    })) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/recetas/${r.id}`)
      setRecetas(prev => prev.filter(x => x.id !== r.id))
      toast.success('Receta eliminada.')
    } catch (e) {
      toast.error(mensajeDe(e))
    }
  }

  const columnas: TableColumnsType<ItemReceta> = [
    { title: 'Medicamento', dataIndex: 'medicamento', render: (v: string) => <Text strong>{v || '—'}</Text> },
    { title: 'Dosis', dataIndex: 'dosis', render: (v: string) => v || '—' },
    { title: 'Vía', dataIndex: 'via', render: (v: string) => v || '—' },
    { title: 'Frecuencia', dataIndex: 'frecuencia', render: (v: string) => v || '—' },
    { title: 'Duración', dataIndex: 'duracion', render: (v: string) => v || '—' },
  ]

  return (
    <Card className="tarjeta-viva" styles={{ body: { padding: 0 } }}>
      <Flex align="center" gap={8} style={{ padding: '12px 16px', background: BRAND.panel, borderBottom: `1px solid ${BRAND.border}` }}>
        <MedicineBoxOutlined style={{ color: BRAND.primary }} />
        <Text strong>Recetas</Text>
        <Tag style={{ margin: 0 }}>{recetas.length}</Tag>
        {puedeEscribir && <Button type="primary" size="small" icon={<PlusOutlined />} style={{ marginLeft: 'auto' }} onClick={abrirNueva}>Nueva receta</Button>}
      </Flex>

      {!puedeEscribir && <Text type="secondary" style={{ display: 'block', fontSize: 12, padding: '12px 16px 0' }}>
        Solo el veterinario puede emitir o editar recetas; aquí puedes consultarlas.</Text>}

      {/* Formulario (crear/editar): solo veterinario */}
      {formAbierto && puedeEscribir && (
        <Form layout="vertical" onFinish={guardar} className="animar" style={{ padding: 16, borderBottom: `1px solid ${BRAND.border}`, background: BRAND.panel }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
            <Text strong>{editId ? 'Editar receta' : 'Nueva receta'}</Text>
            <Button type="text" icon={<CloseOutlined />} aria-label="Cerrar formulario" onClick={cerrarForm} />
          </Flex>
          <div style={{ marginBottom: 16 }}>
            <VoiceTextProcessor
              endpoint="/api/procesar-receta"
              labelGrabar="Dictar receta"
              placeholderTexto="Escriba o pegue lo que va a recetar (medicamento, dosis, vía, frecuencia, duración)…"
              onResult={({ diagnostico, indicaciones, items }) => applyDictado({ diagnostico, indicaciones, items })}
              resumirResultado={({ items }) => {
                const n = ((items || []) as ItemReceta[]).filter(i => i.medicamento?.trim()).length
                return n ? `${n} medicamento${n > 1 ? 's' : ''} detectado${n > 1 ? 's' : ''}` : 'No se detectaron medicamentos'
              }}
            />
          </div>

          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item label="Fecha">
                <DatePicker allowClear={false} style={{ width: '100%' }} value={dayjs(form.fecha)} format="DD/MM/YYYY"
                  onChange={d => d && setForm(f => ({ ...f, fecha: d.format('YYYY-MM-DD') }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item label="Diagnóstico / motivo">
                <Input value={form.diagnostico} placeholder="Ej. Gastroenteritis leve" onChange={e => setForm(f => ({ ...f, diagnostico: e.target.value }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Medicamentos" required>
            <ItemsEditor items={form.items} onChange={items => setForm(f => ({ ...f, items }))} />
          </Form.Item>
          <Form.Item label="Indicaciones para el propietario">
            <Input.TextArea rows={2} value={form.indicaciones} placeholder="Ej. Dieta blanda por 3 días, control si no mejora…"
              onChange={e => setForm(f => ({ ...f, indicaciones: e.target.value }))} />
          </Form.Item>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
          <Flex justify="end" gap={8}>
            <Button onClick={cerrarForm}>Cancelar</Button>
            <Button type="primary" htmlType="submit" loading={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Guardar receta'}</Button>
          </Flex>
        </Form>
      )}

      {/* Lista */}
      {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 3 }} /></div>
        : recetas.length === 0 ? <Empty style={{ padding: '32px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin recetas registradas" />
          : recetas.map(r => (
            <div key={r.id} style={{ padding: '14px 16px', borderTop: `1px solid ${BRAND.border}` }}>
              <Flex justify="space-between" align="start" wrap gap={8}>
                <div>
                  <Text strong>{fmtFecha(r.fecha)}</Text>
                  {r.diagnostico && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.diagnostico}</Text></div>}
                  {r.veterinario_nombre && <div><Text style={{ fontSize: 12, color: BRAND.primary }}>Dr(a). {r.veterinario_nombre}</Text></div>}
                </div>
                <Flex gap={4}>
                  <Tooltip title="Descargar PDF"><Button icon={<DownloadOutlined />} aria-label="Descargar PDF" onClick={() => descargarPDF(paciente, cliente, r)} /></Tooltip>
                  <Tooltip title="Enviar al cliente por WhatsApp"><Button icon={<SendOutlined />} aria-label="Enviar por WhatsApp" loading={enviandoId === r.id} onClick={() => handleEnviar(r)} /></Tooltip>
                  {puedeEscribir && (
                    <>
                      <Tooltip title="Editar receta"><Button icon={<EditOutlined />} aria-label="Editar receta" onClick={() => abrirEditar(r)} /></Tooltip>
                      <Tooltip title="Eliminar receta"><Button danger icon={<DeleteOutlined />} aria-label="Eliminar receta" onClick={() => eliminar(r)} /></Tooltip>
                    </>
                  )}
                </Flex>
              </Flex>
              <Table<ItemReceta> rowKey={(_, i) => String(i)} size="small" columns={columnas} dataSource={r.items || []} pagination={false}
                scroll={{ x: 'max-content' }} style={{ marginTop: 8 }} />
              {r.indicaciones && (
                <Alert type="info" showIcon={false} style={{ marginTop: 8 }} title={<><strong>Indicaciones: </strong>{r.indicaciones}</>} />
              )}
              {r.actualizado_por && <Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
                Última edición: {r.actualizado_por} · {fmtFechaHora(r.actualizado_en)}</Text>}
            </div>
          ))}
    </Card>
  )
}
