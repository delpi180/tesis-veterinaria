import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Flex, Input, Row, Table, Tag, Typography, Upload } from 'antd'
import type { TableColumnsType } from 'antd'
import { AudioOutlined, CalculatorOutlined, DownloadOutlined } from '@ant-design/icons'
import { api, authHeaders, descargarArchivo } from '../../services/api'
import { mensajeDe, Seccion } from './comun'

const { Text } = Typography
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface ErrorPalabra { tipo: 'sub' | 'del' | 'ins'; referencia: string | null; sistema: string | null }
interface ResultadoWer {
  palabras_ref: number; sustituidas: number; borradas: number; insertadas: number
  wer: number; wer_clinico: number | null; terminos_clinicos: number
  errores: ErrorPalabra[]; errores_clinicos: ErrorPalabra[]
}
interface Resumen {
  n: number; wer_global: number | null; wer_clinico_global: number | null; terminos_clinicos: number
  wer: { media: number | null; mediana: number | null; ic95_low: number | null; ic95_high: number | null }
}

const TIPO: Record<string, { texto: string; color: string }> = {
  sub: { texto: 'Cambió la palabra', color: 'warning' },
  del: { texto: 'No la escribió', color: 'error' },
  ins: { texto: 'Agregó de más', color: 'blue' },
}
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)} %`)

/** WER: qué tan bien transcribe la voz. Se compara lo que escribió el sistema con lo que de verdad se dijo. */
export default function WerPanel() {
  const [referencia, setReferencia] = useState('')
  const [sistema, setSistema] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [duracion, setDuracion] = useState<number | null>(null)
  const [res, setRes] = useState<ResultadoWer | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargarResumen = useCallback(() => {
    api.get('/api/evaluacion/wer').then((r: Resumen) => setResumen(r)).catch(() => {})
  }, [])
  useEffect(cargarResumen, [cargarResumen])

  const calcular = async () => {
    if (!referencia.trim() || !sistema.trim()) { setError('Escribe las dos transcripciones.'); return }
    setCargando(true); setError(null)
    try {
      setRes(await api.post('/api/evaluacion/wer', {
        referencia, hipotesis: sistema, etiqueta: etiqueta.trim() || null, duracion_audio_s: duracion,
      }))
      cargarResumen()
    } catch (e) { setError(mensajeDe(e)) } finally { setCargando(false) }
  }

  // Pasa un audio por el mismo transcriptor que usa la consulta (gasta voz: unos centavos).
  const transcribir = async (archivo: File) => {
    setTranscribiendo(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('audio', archivo, archivo.name)
      const r = await fetch(`${BASE_URL}/api/transcribe`, { method: 'POST', body: fd, headers: authHeaders() })
      const cuerpo = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(cuerpo?.detail ?? `Error al transcribir (HTTP ${r.status})`)
      setSistema(cuerpo.transcripcion)
      setDuracion(cuerpo.duracion_audio_s ?? null)
    } catch (e) { setError(mensajeDe(e)) } finally { setTranscribiendo(false) }
  }

  const metricas = res ? [
    { l: 'WER (todas las palabras)', v: pct(res.wer), n: `${res.sustituidas + res.borradas + res.insertadas} errores en ${res.palabras_ref} palabras` },
    { l: 'WER en términos clínicos', v: pct(res.wer_clinico), n: res.terminos_clinicos ? `${res.terminos_clinicos} términos clínicos` : 'No había términos clínicos' },
  ] : []

  const columnas: TableColumnsType<ErrorPalabra> = [
    { title: 'Qué pasó', dataIndex: 'tipo', render: (t: string) => <Tag color={TIPO[t].color} style={{ margin: 0 }}>{TIPO[t].texto}</Tag> },
    { title: 'Se dijo', dataIndex: 'referencia', render: (v: string | null) => v ?? '—' },
    { title: 'El sistema escribió', dataIndex: 'sistema', render: (v: string | null) => v ?? '—' },
  ]

  return (
    <Seccion titulo="Calidad de la voz (WER)"
      nota="WER = errores ÷ palabras que se dijeron. Pega lo que de verdad se dijo (escrito a mano) y lo que escribió el sistema. Escribe los números con cifras (39.2), como los escribe el sistema, o contarán como error."
      extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => descargarArchivo('/api/evaluacion/exportar?tabla=wer', 'wer.csv').catch(e => setError(mensajeDe(e)))}>Excel</Button>}>
      <Flex vertical gap={12}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <label htmlFor="wer-ref"><Text type="secondary" style={{ fontSize: 12 }}>Lo que se dijo (referencia escrita a mano)</Text></label>
            <Input.TextArea id="wer-ref" rows={5} value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Escucha el audio y escribe exactamente lo que dice el doctor…" />
          </Col>
          <Col xs={24} md={12}>
            <label htmlFor="wer-sis"><Text type="secondary" style={{ fontSize: 12 }}>Lo que escribió el sistema</Text></label>
            <Input.TextArea id="wer-sis" rows={5} value={sistema} onChange={e => setSistema(e.target.value)} placeholder="Pega la transcripción de la consulta, o sube el audio…" />
          </Col>
        </Row>
        <Flex gap={8} wrap align="center">
          <Input style={{ maxWidth: 320 }} value={etiqueta} onChange={e => setEtiqueta(e.target.value)} maxLength={120}
            placeholder="Nota (opcional): consulta del lunes, Dr. …" aria-label="Nota de la evaluación" />
          <Upload accept="audio/*,video/webm" showUploadList={false} beforeUpload={(f) => { transcribir(f); return false }}>
            <Button icon={<AudioOutlined />} loading={transcribiendo}>Subir audio y transcribir</Button>
          </Upload>
          <Button type="primary" icon={<CalculatorOutlined />} loading={cargando} onClick={calcular}>Calcular WER</Button>
        </Flex>
        {error && <Alert type="error" showIcon title={error} />}

        {res && (
          <Flex vertical gap={12} className="animar">
            <Row gutter={[12, 12]}>
              {metricas.map(m => (
                <Col key={m.l} xs={24} md={12}>
                  <Card size="small">
                    <Text type="secondary" style={{ fontSize: 12 }}>{m.l}</Text>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{m.v}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{m.n}</Text>
                  </Card>
                </Col>
              ))}
            </Row>
            {res.errores.length > 0 && (
              <Table<ErrorPalabra> rowKey={(_, i) => String(i)} size="small" columns={columnas} dataSource={res.errores}
                pagination={false} scroll={{ x: 'max-content', y: 240 }} />
            )}
          </Flex>
        )}

        {resumen && resumen.n > 0 && (
          <Alert type="info" showIcon
            title={`Acumulado: ${resumen.n} evaluación(es) — WER global ${pct(resumen.wer_global)}`}
            description={<>
              Promedio por consulta {pct(resumen.wer.media)}
              {resumen.wer.ic95_low != null && resumen.wer.ic95_high != null && <> (IC 95 %: {pct(resumen.wer.ic95_low)} a {pct(resumen.wer.ic95_high)})</>}
              {' · '}Mediana {pct(resumen.wer.mediana)} · WER en términos clínicos {pct(resumen.wer_clinico_global)} ({resumen.terminos_clinicos} términos).
            </>} />
        )}
      </Flex>
    </Seccion>
  )
}
