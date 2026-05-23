import { useState, useRef, useEffect } from 'react'

/**
 * Hook que encapsula MediaRecorder.
 *
 * Uso:
 *   const { isRecording, seconds, micError, start, stop } = useAudioRecorder()
 *
 * - start()       → pide permiso de micrófono y comienza a grabar
 * - stop()        → detiene la grabación y devuelve Promise<Blob|null>
 * - isRecording   → true mientras graba
 * - seconds       → cronómetro en segundos
 * - micError      → string con error (null si no hay)
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds]         = useState(0)
  const [micError, setMicError]       = useState(null)

  const recorderRef  = useRef(null)
  const chunksRef    = useRef([])
  const streamRef    = useRef(null)
  const timerRef     = useRef(null)
  const resolveRef   = useRef(null)

  // limpieza al desmontar el componente
  useEffect(() => () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const start = async () => {
    setMicError(null)
    setSeconds(0)

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setMicError('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    const recorder = new MediaRecorder(stream)
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      resolveRef.current?.(blob)
      resolveRef.current = null
    }

    recorder.start(250)
    setIsRecording(true)
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }

  const stop = () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setIsRecording(false)
    setSeconds(0)

    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state === 'inactive') {
        resolve(null)
        return
      }
      resolveRef.current = resolve
      recorderRef.current.stop()
    })
  }

  return { isRecording, seconds, micError, start, stop }
}
