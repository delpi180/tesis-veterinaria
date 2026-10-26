import { useState, useEffect, useRef } from 'react'
import { Alert, Button, Card, Flex, Grid, Input, Progress, Segmented, Space, Typography, theme } from 'antd'
import {
  AudioOutlined, CheckOutlined, DownloadOutlined, EditOutlined, FileTextOutlined,
  LoadingOutlined, ReloadOutlined, StopOutlined,
} from '@ant-design/icons'
import { BRAND, ESTADO } from '@src/core/color'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { api, authHeaders } from '../services/api'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export type EstadoIA = 'idle' | 'recording' | 'transcribing' | 'processing' | 'done' | 'error'

interface InfoAudio {
  segundos: number | null
  bytes: number
}

interface Props {
  /** Recibe lo que devolvió la IA (y la transcripción) para que la pantalla rellene el formulario. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onResult?: (resultado: any) => void
  onStateChange?: (estado: EstadoIA) => void
  endpoint?: string
  labelGrabar?: string
  placeholderTexto?: string
  /** Opcional: recibe la respuesta del backend y devuelve un texto corto
   *  («24 campos completados») para confirmarle al usuario qué se extrajo. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resumirResultado?: (resultado: any) => string | null | undefined
  /** Consulta nueva con el formulario de Volki: el servidor revisa lo no ubicado
   *  contra lo que ese formulario conserva. */
  soloVolki?: boolean
}

const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const fmtMB = (b: number) => b >= 1024 * 1024
  ? `${(b / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.round(b / 1024))} KB`

// Tope de grabación. A ~32 kbps (opus) 90 min pesan ~20 MB, dentro del límite
// de 25 MB que acepta el backend: una consulta larga no se corta a la mitad.
// Además se avisa antes de llegar al tope, para que el corte nunca sorprenda.
const LIMITE_SEG = 90 * 60
const AVISO_SEG = 75 * 60

/**
 * Panel de progreso de la transcripción/extracción.
 *
 * Una consulta larga puede tardar un par de minutos entre subir el audio,
 * transcribirlo y estructurarlo. Sin un cronómetro y unas etapas visibles, el
 * veterinario no sabe si el sistema avanza o se colgó, y puede recargar la
 * página perdiendo la grabación.
 */
function EstadoProceso({ aiState, esperaSeg, audioInfo }: {
  aiState: EstadoIA
  esperaSeg: number
  audioInfo: InfoAudio | null
}) {
  const { token } = theme.useToken()
  if (aiState !== 'transcribing' && aiState !== 'processing') return null
  const transcribiendo = aiState === 'transcribing'
  // En modo «texto libre» no hay audio que transcribir: es un solo paso.
  const conAudio = audioInfo != null

  const etiqueta = transcribiendo
    ? 'Paso 1 de 2 — Transcribiendo el audio…'
    : conAudio
      ? 'Paso 2 de 2 — Extrayendo los datos…'
      : 'Extrayendo los datos…'

  return (
    <Card size="small" role="status" style={{ background: token.colorPrimaryBg, borderColor: token.colorPrimaryBorder }}>
      <Flex vertical gap={6}>
        <Flex align="center" gap={8}>
          <LoadingOutlined style={{ color: BRAND.primary }} />
          <Typography.Text strong style={{ color: BRAND.primaryActive }}>{etiqueta}</Typography.Text>
          <Typography.Text style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: BRAND.primary }}>
            {fmtSec(esperaSeg)}
          </Typography.Text>
        </Flex>
        <Progress percent={transcribiendo ? 50 : 92} showInfo={false} size="small" status="active" />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {audioInfo?.segundos != null && `Audio de ${fmtSec(audioInfo.segundos)} · ${fmtMB(audioInfo.bytes)}. `}
          Las consultas largas pueden tardar un par de minutos. No cierres esta ventana.
        </Typography.Text>
      </Flex>
    </Card>
  )
}

export default function VoiceTextProcessor({
  onResult,
  onStateChange,
  endpoint = '/api/procesar-historia',
  labelGrabar = 'Grabar consulta',
  placeholderTexto = 'Pegue la transcripción o escriba el resumen de la consulta para que la IA extraiga los campos…',
  resumirResultado,
  soloVolki = false,
}: Props) {
  const movil = !Grid.useBreakpoint().md
  const [modoTexto, setModoTexto] = useState(false)
  const [textoManual, setTextoManual] = useState('')
  const [transcripcionIA, setTranscripcionIA] = useState('')
  const [aiState, setAiState] = useState<EstadoIA>('idle')
  const [aiError, setAiError] = useState<string | null>(null)
  const [avisoLimite, setAvisoLimite] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)   // último audio grabado (para reintentar/descargar)
  const [audioInfo, setAudioInfo] = useState<InfoAudio | null>(null)   // del audio que se está procesando
  const [esperaSeg, setEsperaSeg] = useState(0)      // cronómetro de la espera (transcripción + IA)
  const [resumen, setResumen] = useState<string | null>(null)   // qué se extrajo, para confirmárselo al usuario
  const limiteRef = useRef(false)   // evita que el auto-corte se dispare más de una vez
  // Guarda extra contra re-entradas (además del `disabled` de los botones):
  // evita que dos llamadas a procesarAudio/handleProcesarTexto corran a la vez
  // si algo dispara el flujo dos veces (doble evento, reintento apurado).
  const procesandoRef = useRef(false)

  const { isRecording, seconds, micError, start, stop } = useAudioRecorder()

  const ocupado = aiState === 'recording' || aiState === 'transcribing' || aiState === 'processing'
  const enEspera = aiState === 'transcribing' || aiState === 'processing'

  useEffect(() => {
    if (isRecording && seconds >= LIMITE_SEG && !limiteRef.current) {
      limiteRef.current = true
      setAvisoLimite(true)
      handleGrabar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, isRecording])

  // Cronómetro de la espera: sin esto, una consulta larga deja al veterinario
  // mirando un «Transcribiendo…» fijo, sin saber si avanza o si se colgó.
  useEffect(() => {
    if (!enEspera) { setEsperaSeg(0); return }
    const t = setInterval(() => setEsperaSeg((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [enEspera])

  const updateAiState = (state: EstadoIA) => {
    setAiState(state)
    onStateChange?.(state)
  }

  // Transcribe + estructura un blob de audio. Se reutiliza para reintentar sin
  // tener que volver a grabar la consulta si la transcripción falla.
  const procesarAudio = async (blob: Blob | null, duracionSeg: number | null = null) => {
    if (procesandoRef.current) return   // ya hay un procesamiento en curso
    if (!blob) {
      setAiError('No se capturó audio.')
      updateAiState('error')
      return
    }
    procesandoRef.current = true
    setAudioBlob(blob)
    setAudioInfo({
      segundos: duracionSeg ?? audioInfo?.segundos ?? null,
      bytes: blob.size,
    })
    setResumen(null)
    updateAiState('transcribing')
    setAiError(null)
    try {
      // 1. Transcribir con Deepgram
      const fd = new FormData()
      fd.append('audio', blob, 'consulta.webm')
      const r1 = await fetch(`${BASE_URL}/api/transcribe`, {
        method: 'POST',
        body: fd,
        headers: authHeaders(),
      })
      if (!r1.ok) {
        const b = await r1.json().catch(() => ({}))
        throw new Error(b?.detail ?? `Error al transcribir (HTTP ${r1.status})`)
      }
      const { transcripcion } = await r1.json()
      setTranscripcionIA(transcripcion)

      // 2. Extraer con GPT
      updateAiState('processing')
      const resultado = await api.post(endpoint, { texto: transcripcion, solo_volki: soloVolki })

      onResult?.({ ...resultado, transcripcion })
      setResumen(resumirResultado?.({ ...resultado, transcripcion }) ?? null)
      updateAiState('done')
    } catch (e) {
      setAiError((e as Error).message)
      updateAiState('error')
    } finally {
      procesandoRef.current = false
    }
  }

  const handleGrabar = async () => {
    if (isRecording) {
      const duracion = seconds      // `stop()` reinicia el cronómetro: se guarda antes
      const blob = await stop()
      await procesarAudio(blob, duracion)
    } else {
      updateAiState('recording')
      setAiError(null)
      setAvisoLimite(false)
      setAudioBlob(null)
      limiteRef.current = false
      setTranscripcionIA('')
      await start()
    }
  }

  const reintentar = () => { if (audioBlob) procesarAudio(audioBlob) }

  const descargarAudio = () => {
    if (!audioBlob) return
    const url = URL.createObjectURL(audioBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `consulta_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleProcesarTexto = async () => {
    if (procesandoRef.current) return
    if (!textoManual.trim()) return
    procesandoRef.current = true
    setAudioInfo(null)    // modo texto: no hay audio, es un solo paso
    setResumen(null)
    updateAiState('processing')
    setAiError(null)
    try {
      const resultado = await api.post(endpoint, { texto: textoManual, solo_volki: soloVolki })
      setTranscripcionIA(resultado.transcripcion)
      onResult?.(resultado)
      setResumen(resumirResultado?.(resultado) ?? null)
      updateAiState('done')
    } catch (e) {
      setAiError((e as Error).message)
      updateAiState('error')
    } finally {
      procesandoRef.current = false
    }
  }

  const cambiarModo = (texto: boolean) => {
    setModoTexto(texto)
    setAiError(null)
    if (aiState === 'error') updateAiState('idle')
  }

  const confirmacion = aiState === 'done' && (
    <Typography.Text strong style={{ color: ESTADO.ok }}>
      <CheckOutlined /> {resumen ?? 'Formulario autocompletado'}
    </Typography.Text>
  )

  return (
    <Card size="small">
      <Flex vertical gap={12}>
        {/* Alternancia de modo */}
        <Flex align="center" justify="space-between" gap={8} wrap>
          <Typography.Text type="secondary" strong style={{ fontSize: 12, textTransform: 'uppercase' }}>
            Método de registro
          </Typography.Text>
          <Segmented
            value={modoTexto ? 'texto' : 'voz'}
            disabled={ocupado}
            onChange={(v) => cambiarModo(v === 'texto')}
            block={movil}
            options={[
              { value: 'voz', label: 'Dictado de voz', icon: <AudioOutlined /> },
              { value: 'texto', label: 'Texto libre', icon: <EditOutlined /> },
            ]}
          />
        </Flex>

        {!modoTexto ? (
          /* MODO VOZ */
          <Flex vertical gap={8}>
            <Flex align="center" gap={16} wrap>
              {/* Micrófono grande: pulsa mientras graba, para que se note que está escuchando */}
              <Button
                type="primary"
                danger={isRecording}
                shape="circle"
                className={isRecording ? 'grabando' : undefined}
                style={{ width: 64, height: 64, fontSize: 26, flexShrink: 0 }}
                icon={isRecording ? <StopOutlined /> : <AudioOutlined />}
                onClick={handleGrabar}
                disabled={enEspera}
                aria-label={isRecording ? `Detener grabación (${fmtSec(seconds)})` : labelGrabar}
              />
              <Flex vertical gap={4} style={{ minWidth: 0 }}>
                <Typography.Text strong>
                  {isRecording ? `Grabando… ${fmtSec(seconds)}` : labelGrabar}
                </Typography.Text>
                {isRecording ? (
                  <span className="ondas" aria-hidden>
                    {Array.from({ length: 16 }, (_, i) => <i key={i} />)}
                  </span>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    Pulsa el micrófono y habla con normalidad.
                  </Typography.Text>
                )}
              </Flex>
              {confirmacion}
            </Flex>

            {/* Aviso al acercarse al tope: el corte nunca debe ser una sorpresa */}
            {isRecording && seconds >= AVISO_SEG && (
              <Alert
                type="warning"
                showIcon
                title={`Llevas ${fmtSec(seconds)} grabando. La grabación se detendrá sola a los ${LIMITE_SEG / 60} minutos y el audio se procesará igual.`}
              />
            )}

            <EstadoProceso aiState={aiState} esperaSeg={esperaSeg} audioInfo={audioInfo} />

            {micError && <Alert type="error" showIcon title={micError} />}

            {transcripcionIA && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase' }}>
                  Transcripción recibida
                </Typography.Text>
                <div
                  style={{
                    maxHeight: 80, overflowY: 'auto', padding: '8px 12px', marginTop: 4,
                    border: `1px solid ${BRAND.border}`, borderRadius: 8, background: BRAND.body,
                  }}
                >
                  {transcripcionIA}
                </div>
              </div>
            )}
          </Flex>
        ) : (
          /* MODO TEXTO */
          <Flex vertical gap={8}>
            <div>
              <label htmlFor="voz-texto-consulta">
                <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase' }}>
                  Texto de la consulta (pegar o escribir)
                </Typography.Text>
              </label>
              <Input.TextArea
                id="voz-texto-consulta"
                value={textoManual}
                onChange={(e) => setTextoManual(e.target.value)}
                autoSize={{ minRows: 4, maxRows: 12 }}
                placeholder={placeholderTexto}
                style={{ marginTop: 4 }}
              />
            </div>
            <Flex align="center" gap={12} wrap>
              <Button
                type="primary"
                size={movil ? 'large' : 'middle'}
                block={movil}
                icon={aiState === 'processing' ? <LoadingOutlined /> : <FileTextOutlined />}
                onClick={handleProcesarTexto}
                disabled={!textoManual.trim() || aiState === 'processing'}
              >
                {aiState === 'processing' ? 'Procesando…' : 'Procesar con IA'}
              </Button>
              {confirmacion}
            </Flex>
            <EstadoProceso aiState={aiState} esperaSeg={esperaSeg} audioInfo={audioInfo} />
          </Flex>
        )}

        {/* Aviso: corte automático por límite de grabación (el audio se procesa igual) */}
        {avisoLimite && (
          <Alert
            type="warning"
            showIcon
            title={`La grabación alcanzó el límite de ${LIMITE_SEG / 60} minutos y se detuvo automáticamente. Procesando el audio capturado…`}
          />
        )}

        {/* Error de IA. La grabación no se pierde: se puede reintentar o descargar el audio */}
        {aiError && (
          <Alert
            type="error"
            showIcon
            title={`${aiError}. Puedes continuar completando el formulario en modo manual.`}
            description={audioBlob && !enEspera && (
              <Space wrap style={{ marginTop: 4 }}>
                <Button type="primary" size={movil ? 'middle' : 'small'} icon={<ReloadOutlined />} onClick={reintentar}>
                  Reintentar transcripción
                </Button>
                <Button size={movil ? 'middle' : 'small'} icon={<DownloadOutlined />} onClick={descargarAudio}>
                  Descargar audio
                </Button>
              </Space>
            )}
          />
        )}
      </Flex>
    </Card>
  )
}
