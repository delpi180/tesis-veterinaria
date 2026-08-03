import { useState, useEffect, useRef } from "react";
import { Mic, StopCircle, Loader2, Check, AlertTriangle, FileText, Keyboard } from "lucide-react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { api, authHeaders } from "../services/api";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtMB  = (b) => b >= 1024 * 1024
  ? `${(b / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * Panel de progreso de la transcripción/extracción.
 *
 * Una consulta larga puede tardar un par de minutos entre subir el audio,
 * transcribirlo y estructurarlo. Sin un cronómetro y unas etapas visibles, el
 * veterinario no sabe si el sistema avanza o se colgó, y puede recargar la
 * página perdiendo la grabación.
 */
function EstadoProceso({ aiState, esperaSeg, audioInfo }) {
  if (aiState !== "transcribing" && aiState !== "processing") return null;
  const transcribiendo = aiState === "transcribing";
  // En modo "texto libre" no hay audio que transcribir: es un solo paso.
  const conAudio = audioInfo != null;

  const etiqueta = transcribiendo
    ? "Paso 1 de 2 — Transcribiendo el audio…"
    : conAudio
      ? "Paso 2 de 2 — Extrayendo los datos…"
      : "Extrayendo los datos…";

  return (
    <div className="rounded-md border border-purple-200 bg-purple-50 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-purple-700 shrink-0" />
        <span className="text-xs font-semibold text-purple-800">{etiqueta}</span>
        <span className="ml-auto text-xs font-mono text-purple-700 tabular-nums">{fmtSec(esperaSeg)}</span>
      </div>

      <div className="h-1.5 rounded-full bg-purple-200 overflow-hidden">
        <div
          className={`h-full bg-purple-600 rounded-full transition-all duration-700 ease-out ${
            transcribiendo ? "w-1/2" : "w-[92%]"
          }`}
        />
      </div>

      <p className="text-[11px] text-purple-700 leading-snug">
        {audioInfo?.segundos != null && `Audio de ${fmtSec(audioInfo.segundos)} · ${fmtMB(audioInfo.bytes)}. `}
        Las consultas largas pueden tardar un par de minutos. No cierres esta ventana.
      </p>
    </div>
  );
}

export default function VoiceTextProcessor({
  onResult,
  onStateChange,
  endpoint = "/api/procesar-historia",
  labelGrabar = "Grabar consulta",
  placeholderTexto = "Pegue la transcripción o escriba el resumen de la consulta para que la IA extraiga los campos…",
  // Opcional: recibe la respuesta del backend y devuelve un texto corto
  // ("24 campos completados") para confirmarle al usuario qué se extrajo.
  resumirResultado,
}) {
  const [modoTexto, setModoTexto] = useState(false);
  const [textoManual, setTextoManual] = useState("");
  const [transcripcionIA, setTranscripcionIA] = useState("");
  const [aiState, setAiState] = useState("idle"); // idle | recording | transcribing | processing | done | error
  const [aiError, setAiError] = useState(null);
  const [avisoLimite, setAvisoLimite] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);   // último audio grabado (para reintentar/descargar)
  const [audioInfo, setAudioInfo] = useState(null);   // {segundos, bytes} del audio que se está procesando
  const [esperaSeg, setEsperaSeg] = useState(0);      // cronómetro de la espera (transcripción + IA)
  const [resumen, setResumen]     = useState(null);   // qué se extrajo, para confirmárselo al usuario
  const limiteRef = useRef(false);   // evita que el auto-corte se dispare más de una vez
  // Guarda extra contra re-entradas (además del `disabled` de los botones):
  // evita que dos llamadas a procesarAudio/handleProcesarTexto corran a la vez
  // si algo dispara el flujo dos veces (doble evento, reintento apurado).
  const procesandoRef = useRef(false);

  const { isRecording, seconds, micError, start, stop } = useAudioRecorder();

  // Tope de grabación. A ~32 kbps (opus) 90 min pesan ~20 MB, dentro del límite
  // de 25 MB que acepta el backend: una consulta larga no se corta a la mitad.
  // Además se avisa antes de llegar al tope, para que el corte nunca sorprenda.
  const LIMITE_SEG = 90 * 60;
  const AVISO_SEG  = 75 * 60;
  useEffect(() => {
    if (isRecording && seconds >= LIMITE_SEG && !limiteRef.current) {
      limiteRef.current = true;
      setAvisoLimite(true);
      handleGrabar();
    }
  }, [seconds, isRecording]);

  // Cronómetro de la espera: sin esto, una consulta larga deja al veterinario
  // mirando un "Transcribiendo…" fijo, sin saber si avanza o si se colgó.
  useEffect(() => {
    const enEspera = aiState === "transcribing" || aiState === "processing";
    if (!enEspera) { setEsperaSeg(0); return; }
    const t = setInterval(() => setEsperaSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [aiState]);

  const updateAiState = (state) => {
    setAiState(state);
    onStateChange?.(state);
  };

  // Transcribe + estructura un blob de audio. Se reutiliza para reintentar sin
  // tener que volver a grabar la consulta si la transcripción falla.
  const procesarAudio = async (blob, duracionSeg = null) => {
    if (procesandoRef.current) return;   // ya hay un procesamiento en curso
    if (!blob) {
      setAiError("No se capturó audio.");
      updateAiState("error");
      return;
    }
    procesandoRef.current = true;
    setAudioBlob(blob);
    setAudioInfo({
      segundos: duracionSeg ?? audioInfo?.segundos ?? null,
      bytes: blob.size,
    });
    setResumen(null);
    updateAiState("transcribing");
    setAiError(null);
    try {
      // 1. Transcribir con Deepgram
      const fd = new FormData();
      fd.append("audio", blob, "consulta.webm");
      const r1 = await fetch(`${BASE_URL}/api/transcribe`, {
        method: "POST",
        body: fd,
        headers: authHeaders(),
      });
      if (!r1.ok) {
        const b = await r1.json().catch(() => ({}));
        throw new Error(b?.detail ?? `Error al transcribir (HTTP ${r1.status})`);
      }
      const { transcripcion } = await r1.json();
      setTranscripcionIA(transcripcion);

      // 2. Extraer con GPT
      updateAiState("processing");
      const resultado = await api.post(endpoint, { texto: transcripcion });

      onResult?.({ ...resultado, transcripcion });
      setResumen(resumirResultado?.({ ...resultado, transcripcion }) ?? null);
      updateAiState("done");
    } catch (e) {
      setAiError(e.message);
      updateAiState("error");
    } finally {
      procesandoRef.current = false;
    }
  };

  const handleGrabar = async () => {
    if (isRecording) {
      const duracion = seconds;      // `stop()` reinicia el cronómetro: se guarda antes
      const blob = await stop();
      await procesarAudio(blob, duracion);
    } else {
      updateAiState("recording");
      setAiError(null);
      setAvisoLimite(false);
      setAudioBlob(null);
      limiteRef.current = false;
      setTranscripcionIA("");
      await start();
    }
  };

  const reintentar = () => { if (audioBlob) procesarAudio(audioBlob); };

  const descargarAudio = () => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consulta_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleProcesarTexto = async () => {
    if (procesandoRef.current) return;
    if (!textoManual.trim()) return;
    procesandoRef.current = true;
    setAudioInfo(null);    // modo texto: no hay audio, es un solo paso
    setResumen(null);
    updateAiState("processing");
    setAiError(null);
    try {
      const resultado = await api.post(endpoint, { texto: textoManual });
      setTranscripcionIA(resultado.transcripcion);
      onResult?.(resultado);
      setResumen(resumirResultado?.(resultado) ?? null);
      updateAiState("done");
    } catch (e) {
      setAiError(e.message);
      updateAiState("error");
    } finally {
      procesandoRef.current = false;
    }
  };

  const lCls = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1";
  const hlInput = "w-full rounded-md px-2.5 py-1.5 text-sm text-slate-800 border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-300";

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4 shadow-sm">
      {/* Botones de alternancia de modo */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Método de registro</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setModoTexto(false);
              setAiError(null);
              if (aiState === "error") updateAiState("idle");
            }}
            disabled={aiState === "recording" || aiState === "transcribing" || aiState === "processing"}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
              !modoTexto
                ? "bg-purple-100 text-purple-700"
                : "text-slate-500 hover:bg-slate-200 disabled:opacity-50"
            }`}
          >
            <Mic size={13} /> Dictado de voz
          </button>
          <button
            type="button"
            onClick={() => {
              setModoTexto(true);
              setAiError(null);
              if (aiState === "error") updateAiState("idle");
            }}
            disabled={aiState === "recording" || aiState === "transcribing" || aiState === "processing"}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
              modoTexto
                ? "bg-purple-100 text-purple-700"
                : "text-slate-500 hover:bg-slate-200 disabled:opacity-50"
            }`}
          >
            <Keyboard size={13} /> Texto libre
          </button>
        </div>
      </div>

      {/* Renderizado de modo */}
      {!modoTexto ? (
        /* MODO VOZ */
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleGrabar}
              disabled={aiState === "transcribing" || aiState === "processing"}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 ${
                isRecording
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-purple-700 hover:bg-purple-800 text-white"
              }`}
            >
              {isRecording ? (
                <>
                  <StopCircle size={15} className="animate-pulse" /> Detener ({fmtSec(seconds)})
                </>
              ) : (
                <>
                  <Mic size={15} /> {labelGrabar}
                </>
              )}
            </button>

            {aiState === "done" && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <Check size={13} /> {resumen ?? "Formulario autocompletado"}
              </span>
            )}
          </div>

          {/* Aviso al acercarse al tope: el corte nunca debe ser una sorpresa */}
          {isRecording && seconds >= AVISO_SEG && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-px" />
              <span>
                Llevas {fmtSec(seconds)} grabando. La grabación se detendrá sola a los{" "}
                {LIMITE_SEG / 60} minutos y el audio se procesará igual.
              </span>
            </div>
          )}

          <EstadoProceso aiState={aiState} esperaSeg={esperaSeg} audioInfo={audioInfo} />

          {micError && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-px" />
              <span>{micError}</span>
            </div>
          )}

          {transcripcionIA && (
            <div>
              <p className={lCls}>Transcripción recibida</p>
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 max-h-20 overflow-y-auto">
                {transcripcionIA}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* MODO TEXTO */
        <div className="space-y-2">
          <div>
            <label className={lCls}>Texto de la consulta (pegar o escribir)</label>
            <textarea
              value={textoManual}
              onChange={(e) => setTextoManual(e.target.value)}
              rows={4}
              placeholder={placeholderTexto}
              className={`${hlInput} resize-y`}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleProcesarTexto}
              disabled={!textoManual.trim() || aiState === "processing"}
              className="flex items-center gap-2 px-4 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors"
            >
              {aiState === "processing" ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Procesando…
                </>
              ) : (
                <>
                  <FileText size={13} /> Procesar con IA
                </>
              )}
            </button>
            {aiState === "done" && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <Check size={13} /> {resumen ?? "Formulario autocompletado"}
              </span>
            )}
          </div>
          <EstadoProceso aiState={aiState} esperaSeg={esperaSeg} audioInfo={audioInfo} />
        </div>
      )}

      {/* Aviso: corte automático por límite de grabación (el audio se procesa igual) */}
      {avisoLimite && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          <span>
            La grabación alcanzó el límite de {LIMITE_SEG / 60} minutos y se detuvo
            automáticamente. Procesando el audio capturado…
          </span>
        </div>
      )}

      {/* Error de IA */}
      {aiError && (
        <div className="flex flex-col gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-px" />
            <span>{aiError}. Podés continuar completando el formulario en modo manual.</span>
          </div>
          {/* La grabación no se pierde: se puede reintentar o descargar el audio */}
          {audioBlob && aiState !== "transcribing" && aiState !== "processing" && (
            <div className="flex items-center gap-2 pl-5">
              <button
                type="button"
                onClick={reintentar}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-purple-700 hover:bg-purple-800 text-white font-semibold transition-colors"
              >
                <Loader2 size={12} /> Reintentar transcripción
              </button>
              <button
                type="button"
                onClick={descargarAudio}
                className="px-2.5 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold transition-colors"
              >
                Descargar audio
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
