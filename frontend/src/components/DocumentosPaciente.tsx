import { useState, useEffect } from 'react'
import { Badge, Button, Card, Empty, Flex, Grid, Input, List, Select, Space, Spin, Tag, Typography, theme } from 'antd'
import {
  DeleteOutlined, EyeOutlined, FileImageOutlined, FileTextOutlined, LoadingOutlined,
  PaperClipOutlined, UploadOutlined,
} from '@ant-design/icons'
import { BRAND } from '@src/core/color'
import { api, authHeaders } from '../services/api'
import { useToast } from './Toast'
import { useConfirmar } from './Confirmar'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface Documento {
  id: number
  nombre: string
  categoria: string
  mime_type?: string | null
  tamano_bytes: number
  creado_en: string
  subido_por?: string | null
  descripcion?: string | null
}

// Cada categoría usa un color de etiqueta de antd; ninguno es un hex suelto.
const CATEGORIAS = [
  { v: 'radiografia', l: 'Radiografía', color: 'blue' },
  { v: 'analisis',    l: 'Análisis',    color: 'green' },
  { v: 'receta',      l: 'Receta',      color: 'cyan' },
  { v: 'otro',        l: 'Otro',        color: 'default' },
]
const catInfo = (v: string) => CATEGORIAS.find(c => c.v === v) ?? CATEGORIAS[3]

const fmtTam = (b: number) => b >= 1024 * 1024
  ? `${(b / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.round(b / 1024))} KB`

const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima',
})

const esImagen = (mime?: string | null) => (mime || '').startsWith('image/')

interface Props {
  pacienteId: number | string
  historiaId?: number | string | null
  titulo?: string
}

/**
 * Documentos complementarios de una mascota.
 *
 * Sin `historiaId`: documentos generales del paciente (uso en la ficha del
 * cliente). Con `historiaId`: se acotan a esa consulta puntual — así una
 * radiografía o análisis queda ligado a la visita donde se pidió, en vez de
 * quedar suelto a nivel de la mascota sin saber a qué consulta corresponde.
 */
export default function DocumentosPaciente({ pacienteId, historiaId = null, titulo = 'Documentos complementarios' }: Props) {
  const { token } = theme.useToken()
  const movil = !Grid.useBreakpoint().sm
  const confirmar = useConfirmar()
  const toast = useToast()
  const [docs, setDocs] = useState<Documento[]>([])
  const [cargando, setCargando] = useState(true)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [categoria, setCategoria] = useState('radiografia')
  const [descripcion, setDescripcion] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [abriendoId, setAbriendoId] = useState<number | null>(null)
  // Cambiar esta llave vacía el campo de archivo (un <input type=file> no se controla)
  const [llaveArchivo, setLlaveArchivo] = useState(0)

  const urlListado = historiaId
    ? `/api/pacientes/${pacienteId}/documentos/?historia_id=${historiaId}`
    : `/api/pacientes/${pacienteId}/documentos/`
  const urlSubida = historiaId
    ? `${BASE_URL}/api/pacientes/${pacienteId}/historias/${historiaId}/documento`
    : `${BASE_URL}/api/pacientes/${pacienteId}/documentos/`

  const cargar = async () => {
    setCargando(true)
    try {
      setDocs(await api.get(urlListado))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCargando(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (pacienteId) cargar() }, [pacienteId, historiaId])

  const subir = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!archivo) { toast.error('Elige un archivo.'); return }
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('archivo', archivo)
      fd.append('categoria', categoria)
      fd.append('descripcion', descripcion)
      const res = await fetch(urlSubida, {
        method: 'POST', body: fd, headers: authHeaders(),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b?.detail ?? `Error al subir (HTTP ${res.status})`)
      }
      const nuevo = await res.json()
      setDocs(d => [nuevo, ...d])
      setArchivo(null); setDescripcion('')
      setLlaveArchivo(k => k + 1)
      toast.success('Documento subido.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubiendo(false)
    }
  }

  // Descarga con el token y abre el archivo en una pestaña nueva (un <a href> no
  // llevaría el header de autorización, por eso lo bajamos como blob).
  const abrir = async (doc: Documento) => {
    setAbriendoId(doc.id)
    try {
      const res = await fetch(`${BASE_URL}/api/pacientes/${pacienteId}/documentos/${doc.id}/descargar`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error(`No se pudo abrir (HTTP ${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setAbriendoId(null)
    }
  }

  const eliminar = async (doc: Documento) => {
    if (!await confirmar({
      titulo: 'Eliminar documento',
      mensaje: `Se borrará "${doc.nombre}" de la ficha del paciente.`,
      detalle: 'No se puede deshacer. Si es el único ejemplar del análisis o la radiografía, se pierde.',
      confirmarTexto: 'Eliminar',
    })) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/documentos/${doc.id}`)
      setDocs(d => d.filter(x => x.id !== doc.id))
      toast.success('Documento eliminado.')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const tam = movil ? 'large' : 'middle'

  return (
    <Card
      size="small"
      styles={{ body: { padding: 0 } }}
      title={
        <Flex align="center" gap={8}>
          <PaperClipOutlined style={{ color: BRAND.primary }} />
          <span>{titulo}</span>
          <Badge count={docs.length} showZero color={BRAND.primary} />
        </Flex>
      }
    >
      {/* Formulario de subida */}
      <form onSubmit={subir} style={{ padding: 16, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Flex vertical gap={8}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Radiografías, análisis de sangre, recetas y cualquier documento (imágenes, PDF u Office). Máx. 10 MB.
          </Typography.Text>
          <Flex gap={8} wrap>
            {/* El campo nativo de archivo ocupa la fila completa en celular y
                comparte espacio recién en pantallas anchas. */}
            <input
              key={llaveArchivo}
              type="file"
              aria-label="Archivo a subir"
              onChange={e => setArchivo(e.target.files?.[0] ?? null)}
              style={{ flex: movil ? '1 1 100%' : '1 1 0', minWidth: 0, fontSize: 13 }}
            />
            <Select
              value={categoria}
              onChange={setCategoria}
              size={tam}
              aria-label="Categoría del documento"
              style={{ width: movil ? '100%' : 160 }}
              options={CATEGORIAS.map(c => ({ value: c.v, label: c.l }))}
            />
          </Flex>
          <Flex gap={8} wrap>
            <Input
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              aria-label="Descripción del documento"
              size={tam}
              style={{ flex: '1 1 180px', minWidth: 0 }}
            />
            <Button
              type="primary"
              htmlType="submit"
              size={tam}
              block={movil}
              loading={subiendo}
              disabled={!archivo}
              icon={<UploadOutlined />}
            >
              {subiendo ? 'Subiendo…' : 'Subir'}
            </Button>
          </Flex>
        </Flex>
      </form>

      {/* Lista */}
      {cargando ? (
        <Flex justify="center" style={{ padding: 32 }}>
          <Space><Spin indicator={<LoadingOutlined />} /> <Typography.Text type="secondary">Cargando documentos…</Typography.Text></Space>
        </Flex>
      ) : docs.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '24px 0' }}
          description={historiaId ? 'Aún no hay documentos en esta consulta' : 'Aún no hay documentos para esta mascota'}
        />
      ) : (
        <List
          dataSource={docs}
          renderItem={doc => {
            const ci = catInfo(doc.categoria)
            const Icono = esImagen(doc.mime_type) ? FileImageOutlined : FileTextOutlined
            return (
              <List.Item
                key={doc.id}
                style={{ padding: '12px 16px' }}
                actions={[
                  <Button
                    key="ver"
                    type="text"
                    size={tam}
                    icon={abriendoId === doc.id ? <LoadingOutlined /> : <EyeOutlined />}
                    disabled={abriendoId === doc.id}
                    aria-label={`Ver o descargar ${doc.nombre}`}
                    title="Ver / descargar"
                    onClick={() => abrir(doc)}
                  />,
                  <Button
                    key="borrar"
                    type="text"
                    danger
                    size={tam}
                    icon={<DeleteOutlined />}
                    aria-label={`Eliminar ${doc.nombre}`}
                    title="Eliminar"
                    onClick={() => eliminar(doc)}
                  />,
                ]}
              >
                <List.Item.Meta
                  avatar={<Icono style={{ fontSize: 22, color: token.colorTextTertiary }} />}
                  title={
                    <Flex align="center" gap={8} wrap>
                      <Typography.Text strong ellipsis style={{ maxWidth: movil ? 180 : 420 }}>{doc.nombre}</Typography.Text>
                      <Tag color={ci.color} style={{ marginInlineEnd: 0 }}>{ci.l}</Tag>
                    </Flex>
                  }
                  description={
                    <>
                      {fmtTam(doc.tamano_bytes)} · {fmtFecha(doc.creado_en)}
                      {doc.subido_por ? ` · ${doc.subido_por}` : ''}
                      {doc.descripcion ? ` · ${doc.descripcion}` : ''}
                    </>
                  }
                />
              </List.Item>
            )
          }}
        />
      )}
    </Card>
  )
}
