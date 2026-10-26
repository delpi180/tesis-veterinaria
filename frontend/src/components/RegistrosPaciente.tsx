import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Empty, Flex, Input, Select, Skeleton, Space, Table, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, EyeOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons'
import { api, authHeaders } from '../services/api'
import { useToast } from './Toast'
import { useConfirmar } from './Confirmar'
import { ESTADO } from '@src/core/color'

const { Text } = Typography

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface Documento { id: number; nombre: string }
interface Registro {
  id: number; fecha: string; producto?: string | null; notas?: string | null
  proxima_fecha?: string | null; documentos?: Documento[]
}
interface EntradaCatalogo { nombre: string; intervalo_dias?: number | null }

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error.')
const fmtFecha = (iso: string) => new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric',
})
const hoyStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Se compara como texto ISO para no meter husos horarios en una fecha simple. */
const vencida = (iso?: string | null) => !!iso && iso < hoyStr()

const PLACEHOLDER: Record<string, string> = {
  antiparasitario: 'Ej. Bravecto, Drontal…',
  estetica: 'Ej. Baño, corte, limpieza dental…',
  complementario: 'Ej. Citología, ecografía, hemograma…',
}

/**
 * Registro simple por mascota para antiparasitarios, estética y exámenes complementarios.
 * tipo: 'antiparasitario' | 'estetica' | 'complementario'
 */
export default function RegistrosPaciente({ pacienteId, tipo, labelProducto = 'Producto' }: {
  pacienteId: number | string
  tipo: 'antiparasitario' | 'estetica' | 'complementario' | string
  labelProducto?: string
}) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const esComplementario = tipo === 'complementario'
  // Cuándo toca repetirlo: es lo que hace que la desparasitación entre en la
  // bandeja de pendientes de recepción.
  const esAntiparasitario = tipo === 'antiparasitario'

  const [items, setItems] = useState<Registro[]>([])
  const [cargando, setCargando] = useState(true)
  const [fecha, setFecha] = useState(hoyStr())
  const [proximaFecha, setProximaFecha] = useState('')
  const [catalogo, setCatalogo] = useState<EntradaCatalogo[]>([])
  const [producto, setProducto] = useState('')
  const [notas, setNotas] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [inputArchivo, setInputArchivo] = useState(0)   // cambia la `key` para vaciar el campo de archivo
  const [guardando, setGuardando] = useState(false)
  const [abriendoId, setAbriendoId] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setItems(await api.get(`/api/pacientes/${pacienteId}/registros/?tipo=${tipo}`))
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [pacienteId, tipo, toast])
  useEffect(() => { if (pacienteId) cargar() }, [pacienteId, cargar])

  useEffect(() => {
    if (!esAntiparasitario) return
    api.get('/api/catalogos/antiparasitarios')
      .then((c: EntradaCatalogo[]) => setCatalogo(Array.isArray(c) ? c : []))
      .catch(() => setCatalogo([]))
  }, [esAntiparasitario])

  // Al elegir un producto del catálogo se propone la próxima fecha con su
  // intervalo habitual; se puede corregir a mano.
  const elegirProducto = (nombre: string) => {
    setProducto(nombre)
    const entrada = catalogo.find(c => c.nombre === nombre)
    if (entrada?.intervalo_dias) {
      const base = new Date(fecha || hoyStr())
      if (!isNaN(base.getTime())) {
        base.setDate(base.getDate() + entrada.intervalo_dias)
        setProximaFecha(base.toISOString().slice(0, 10))
      }
    }
  }

  const agregar = async () => {
    if (!producto.trim() && !notas.trim()) { toast.error('Ingresa al menos el producto o una nota.'); return }
    setGuardando(true)
    try {
      let nuevo: Registro = await api.post(`/api/pacientes/${pacienteId}/registros/`, {
        tipo, fecha, producto: producto.trim() || null, notas: notas.trim() || null,
        proxima_fecha: esAntiparasitario ? (proximaFecha || null) : null,
      })
      if (esComplementario && archivo) {
        const fd = new FormData()
        fd.append('archivo', archivo)
        const res = await fetch(`${BASE_URL}/api/pacientes/${pacienteId}/registros/${nuevo.id}/documento`, {
          method: 'POST', body: fd, headers: authHeaders(),
        })
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          toast.error(b?.detail ?? 'El registro se guardó, pero el archivo no se pudo adjuntar.')
        } else {
          nuevo = await res.json()
        }
      }
      setItems(prev => [nuevo, ...prev])
      setProducto(''); setNotas(''); setFecha(hoyStr()); setArchivo(null); setProximaFecha(''); setInputArchivo(k => k + 1)
      toast.success('Registro agregado.')
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  // Ver/descargar el archivo adjunto (blob autenticado, igual que Documentos).
  const abrirDocumento = async (doc: Documento) => {
    setAbriendoId(doc.id)
    try {
      const res = await fetch(`${BASE_URL}/api/pacientes/${pacienteId}/documentos/${doc.id}/descargar`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`No se pudo abrir (HTTP ${res.status})`)
      const url = URL.createObjectURL(await res.blob())
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error(mensajeDe(e))
    } finally {
      setAbriendoId(null)
    }
  }

  const eliminarDocumento = async (it: Registro, doc: Documento) => {
    if (!await confirmar({ titulo: 'Eliminar archivo', mensaje: `Se borrará "${doc.nombre}" de este registro.`, confirmarTexto: 'Eliminar' })) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/documentos/${doc.id}`)
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, documentos: (x.documentos || []).filter(d => d.id !== doc.id) } : x))
      toast.success('Archivo eliminado.')
    } catch (e) {
      toast.error(mensajeDe(e))
    }
  }

  const eliminar = async (it: Registro) => {
    if (!await confirmar({
      titulo: 'Eliminar registro',
      mensaje: 'Se borrará este registro clínico y los archivos que tenga adjuntos.',
      detalle: 'No se puede deshacer.',
      confirmarTexto: 'Eliminar',
    })) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/registros/${it.id}`)
      setItems(prev => prev.filter(x => x.id !== it.id))
      toast.success('Registro eliminado.')
    } catch (e) {
      toast.error(mensajeDe(e))
    }
  }

  const campo = (etiqueta: string, id: string, hijo: React.ReactNode, ancho?: number) => (
    <Flex vertical gap={4} style={ancho ? { width: ancho } : { flex: 1, minWidth: 160 }}>
      <label htmlFor={id}><Text type="secondary" strong style={{ fontSize: 12 }}>{etiqueta}</Text></label>
      {hijo}
    </Flex>
  )

  const columnas: TableColumnsType<Registro> = [
    { title: 'Fecha', dataIndex: 'fecha', render: (f: string) => <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{fmtFecha(f)}</Text> },
    { title: labelProducto, dataIndex: 'producto', render: (p?: string | null) => <Text strong>{p || '—'}</Text> },
    ...(esAntiparasitario ? [{
      title: 'Próxima', key: 'prox',
      render: (_: unknown, it: Registro) => it.proxima_fecha
        ? <Text strong={vencida(it.proxima_fecha)} style={{ whiteSpace: 'nowrap', color: vencida(it.proxima_fecha) ? ESTADO.peligro : undefined }}>
            {fmtFecha(it.proxima_fecha)}{vencida(it.proxima_fecha) ? ' · vencida' : ''}
          </Text>
        : <Text type="secondary">—</Text>,
    }] : []),
    { title: 'Notas', dataIndex: 'notas', render: (n?: string | null) => <Text type="secondary">{n || '—'}</Text> },
    ...(esComplementario ? [{
      title: 'Archivo', key: 'archivo',
      render: (_: unknown, it: Registro) => (it.documentos || []).length === 0 ? <Text type="secondary">—</Text> : (
        <Flex vertical gap={4}>
          {(it.documentos || []).map(doc => (
            <Flex key={doc.id} align="center" gap={4}>
              <PaperClipOutlined />
              <Text ellipsis style={{ maxWidth: 140, fontSize: 12 }} title={doc.nombre}>{doc.nombre}</Text>
              <Tooltip title="Ver / descargar"><Button size="small" type="text" icon={<EyeOutlined />} loading={abriendoId === doc.id} aria-label="Ver archivo" onClick={() => abrirDocumento(doc)} /></Tooltip>
              <Tooltip title="Eliminar archivo"><Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Eliminar archivo" onClick={() => eliminarDocumento(it, doc)} /></Tooltip>
            </Flex>
          ))}
        </Flex>
      ),
    }] : []),
    {
      title: '', key: 'acc', align: 'right', width: 56,
      render: (_, it) => <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} aria-label="Eliminar registro" onClick={() => eliminar(it)} /></Tooltip>,
    },
  ]

  return (
    <Card className="tarjeta-viva" styles={{ body: { padding: 0 } }}>
      {/* Formulario */}
      <form onSubmit={e => { e.preventDefault(); agregar() }}>
        <Flex wrap align="end" gap={8} style={{ padding: '12px 16px', borderBottom: '1px solid #e4dfd5' }}>
          {campo('Fecha', 'reg-fecha', <Input id="reg-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />, 150)}
          {campo(labelProducto, 'reg-producto', (
            <Space.Compact style={{ width: '100%' }} block>
              {esAntiparasitario && catalogo.length > 0 && (
                <Select style={{ width: 170 }} placeholder="Del catálogo…" showSearch value={catalogo.some(c => c.nombre === producto) ? producto : undefined}
                  onChange={elegirProducto} options={catalogo.map(c => ({ value: c.nombre, label: c.nombre }))} aria-label="Elegir del catálogo" />
              )}
              <Input id="reg-producto" value={producto} onChange={e => setProducto(e.target.value)} placeholder={PLACEHOLDER[tipo] ?? ''} />
            </Space.Compact>
          ))}
          {campo('Notas', 'reg-notas', <Input id="reg-notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />)}
          {esAntiparasitario && campo('Próxima aplicación', 'reg-prox', <Input id="reg-prox" type="date" value={proximaFecha} onChange={e => setProximaFecha(e.target.value)} />, 160)}
          {esComplementario && campo('Archivo (opcional)', 'reg-archivo', (
            <input key={inputArchivo} id="reg-archivo" type="file" style={{ maxWidth: 220, fontSize: 12 }} onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
          ))}
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={guardando}>Agregar</Button>
        </Flex>
      </form>

      {/* Lista */}
      {cargando ? <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 3 }} /></div> : (
        <Table<Registro> rowKey="id" size="middle" columns={columnas} dataSource={items} pagination={false} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin registros todavía" /> }} />
      )}
    </Card>
  )
}
