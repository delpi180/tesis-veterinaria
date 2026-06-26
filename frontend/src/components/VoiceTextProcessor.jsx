import React, { useState, useEffect, useRef } from "react";
import { Mic, StopCircle, Loader2, Check, AlertTriangle, FileText, Keyboard } from "lucide-react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { api, authHeaders } from "../services/api";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export default function VoiceTextProcessor({ onResult, onStateChange }) {
  const [modoTexto, setModoTexto] = useState(false);
  const [textoManual, setTextoManual] = useState("");
  const [transcripcionIA, setTranscripcionIA] = useState("");
  const [aiState, setAiState] = useState("idle"); // idle | recording | transcribing | processing | done | error
  const [aiError, setAiError] = useState(null);
  const [avisoLimite, setAvisoLimite] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);   // último audio grabado (para reintentar/descargar)
  const limiteRef = useRef(false);   // evita que el auto-corte se dispare más de una vez

  const { isRecording, seconds, micError, start, stop } = useAudioRecorder();

  // Límite máximo de grabación (40 min). Con opus a ~32 kbps el archivo sigue
  // siendo liviano; el corte solo evita grabaciones olvidadas abiertas horas.
  // El audio igual se procesa: solo avisamos que se detuvo (no es un error).
  const LIMITE_SEG = 40 * 60;
  useEffect(() => {
    if (isRecording && seconds >= LIMITE_SEG && !limiteRef.current) {
      limiteRef.current = true;
      setAvisoLimite(true);
      handleGrabar();
    }
  }, [seconds, isRecording]);

  const updateAiState = (state) => {
    setAiState(state);
    onStateChange?.(state);
  };

  const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // Transcribe + estructura un blob de audio. Se reutiliza para reintentar sin
  // tener que volver a grabar la consulta si la transcripción falla.
  const procesarAudio = async (blob) => {
    if (!blob) {
      setAiError("No se capturó audio.");
      updateAiState("error");
      return;
    }
    setAudioBlob(blob);
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
      const { datos, inferencias, alertas_rango } = await api.post("/api/procesar-historia", {
        texto: transcripcion,
      });

      onResult?.({ datos, inferencias, alertas_rango, transcripcion });
      updateAiState("done");
    } catch (e) {
      setAiError(e.message);
      updateAiState("error");
    }
  };

  const handleGrabar = async () => {
    if (isRecording) {
      const blob = await stop();
      await procesarAudio(blob);
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
    if (!textoManual.trim()) return;
    updateAiState("processing");
    setAiError(null);
    try {
      const { datos, inferencias, transcripcion, alertas_rango } = await api.post("/api/procesar-historia", {
        texto: textoManual,
      });
      setTranscripcionIA(transcripcion);
      onResult?.({ datos, inferencias, alertas_rango, transcripcion });
      updateAiState("done");
    } catch (e) {
      setAiError(e.message);
      updateAiState("error");
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
                  <Mic size={15} /> Grabar consulta
                </>
              )}
            </button>

            {aiState === "transcribing" && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500 animate-pulse">
                <Loader2 size={13} className="animate-spin" /> Transcribiendo…
              </span>
            )}
            {aiState === "processing" && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500 animate-pulse">
                <Loader2 size={13} className="animate-spin" /> Procesando con IA…
              </span>
            )}
            {aiState === "done" && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <Check size={13} /> Formulario autocompletado
              </span>
            )}
          </div>

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
              placeholder="Pegue la transcripción o escriba el resumen de la consulta para que la IA extraiga los campos…"
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
                <Check size={13} /> Formulario autocompletado
              </span>
            )}
          </div>
        </div>
      )}

      {/* Aviso: corte automático por límite de grabación (el audio se procesa igual) */}
      {avisoLimite && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          <span>La grabación alcanzó el límite de 40 minutos y se detuvo automáticamente. Procesando el audio capturado…</span>
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
