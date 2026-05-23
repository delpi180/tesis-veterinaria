import { useState, useRef } from 'react'

const MicIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
)

const StopIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

const STATUS_LABELS = {
  idle:         { text: 'Listo para iniciar consulta',       color: 'text-slate-500' },
  requesting:   { text: 'Solicitando permiso de micrófono…', color: 'text-amber-600' },
  recording:    { text: 'Grabando consulta…',                color: 'text-red-600'   },
  transcribing: { text: 'Transcribiendo audio con Whisper…', color: 'text-violet-600' },
  processing:   { text: 'Analizando nota clínica (SOAP)…',   color: 'text-violet-600' },
  error:        { text: '',                                  color: 'text-red-500'   },
}

export default function AudioRecorder({ onResult, onStatusChange }) {
  const [status, setStatus] = useState('idle')
  const [error, setError]   = useState(null)
  const [seconds, setSeconds] = useState(0)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)
  const timerRef         = useRef(null)

  const updateStatus = (s) => {
    setStatus(s)
    onStatusChange?.(s)
  }

  const startRecording = async () => {
    setError(null)
    setSeconds(0)
    updateStatus('requesting')

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
      updateStatus('error')
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    const recorder = new MediaRecorder(stream)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => handleStop()
    recorder.start(250)

    updateStatus('recording')
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }

  const stopRecording = () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    mediaRecorderRef.current?.stop()
  }

  const handleStop = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    updateStatus('transcribing')

    let transcripcion
    try {
      const form = new FormData()
      form.append('audio', blob, 'consulta.webm')
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Transcripción: ${res.status}`)
      ;({ transcripcion } = await res.json())
    } catch (e) {
      setError(`Error al transcribir: ${e.message}`)
      updateStatus('error')
      return
    }

    updateStatus('processing')

    let soap
    try {
      const res = await fetch('/api/process-soap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: transcripcion }),
      })
      if (!res.ok) throw new Error(`SOAP: ${res.status}`)
      soap = await res.json()
    } catch (e) {
      setError(`Error al procesar SOAP: ${e.message}`)
      updateStatus('error')
      return
    }

    onResult?.({ transcripcion, soap })
    updateStatus('idle')
    setSeconds(0)
  }

  const isRecording    = status === 'recording'
  const isProcessing   = ['requesting', 'transcribing', 'processing'].includes(status)
  const isDisabled     = isProcessing

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Botón principal */}
      <div className="relative flex items-center justify-center">
        {isRecording && (
          <>
            <span className="absolute inline-flex h-28 w-28 rounded-full bg-red-400 opacity-30 animate-ping" />
            <span className="absolute inline-flex h-36 w-36 rounded-full bg-red-300 opacity-15 animate-ping" style={{ animationDelay: '0.3s' }} />
          </>
        )}
        {isProcessing && (
          <span className="absolute inline-flex h-28 w-28 rounded-full bg-violet-400 opacity-25 animate-ping" />
        )}

        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isDisabled}
          className={[
            'relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg focus:outline-none focus:ring-4',
            isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-300'
              : isProcessing
                ? 'bg-violet-200 text-violet-400 cursor-not-allowed'
                : 'bg-purple-700 hover:bg-purple-600 active:scale-95 text-white focus:ring-purple-300',
          ].join(' ')}
        >
          {isProcessing
            ? <div className="w-8 h-8 border-3 border-violet-400 border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px' }} />
            : isRecording
              ? <StopIcon className="w-10 h-10" />
              : <MicIcon className="w-10 h-10" />
          }
        </button>
      </div>

      {/* Timer */}
      {isRecording && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-600 font-mono font-semibold text-lg">{fmt(seconds)}</span>
        </div>
      )}

      {/* Label de estado */}
      <p className={`text-sm font-medium ${STATUS_LABELS[status]?.color}`}>
        {STATUS_LABELS[status]?.text}
      </p>

      {/* Botones de texto */}
      {!isRecording && !isProcessing && (
        <button
          onClick={startRecording}
          className="px-6 py-2.5 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition-colors"
        >
          Iniciar Consulta
        </button>
      )}
      {isRecording && (
        <button
          onClick={stopRecording}
          className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg shadow transition-colors"
        >
          Detener Consulta
        </button>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <div className="w-full max-w-md bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
    </div>
  )
}
