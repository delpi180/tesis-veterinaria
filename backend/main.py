from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import engine, Base
import models  # registra todos los modelos con Base antes de create_all
from routers import clientes, pacientes
from services.transcription import transcribe_audio
from services.soap_processor import process_soap, SOAPResponse

app = FastAPI(title="Veterinaria Los Pinos API")

# CORS debe registrarse ANTES de cualquier router
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clientes.router)
app.include_router(pacientes.router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# Schemas de entrada/salida
# ---------------------------------------------------------------------------

class TranscribeResponse(BaseModel):
    transcripcion: str


class ProcessSOAPRequest(BaseModel):
    texto: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Veterinaria Los Pinos API funcionando"}


@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe_endpoint(audio: UploadFile = File(...)):
    """
    Recibe un archivo de audio (wav, mp3, m4a, webm…) y devuelve la
    transcripción en texto plano usando Whisper base.
    """
    allowed = {".wav", ".mp3", ".mp4", ".m4a", ".webm", ".ogg", ".flac"}
    import os
    ext = os.path.splitext(audio.filename or "")[-1].lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Formato de audio no soportado: '{ext}'. "
                   f"Usa uno de: {', '.join(allowed)}",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="El archivo de audio está vacío.")

    try:
        texto = transcribe_audio(audio_bytes, filename=audio.filename or "audio.wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en transcripción: {str(e)}")

    return TranscribeResponse(transcripcion=texto)


@app.post("/api/process-soap", response_model=SOAPResponse)
def process_soap_endpoint(body: ProcessSOAPRequest):
    """
    Recibe texto clínico y devuelve el JSON estructurado en formato SOAP
    (Subjetivo, Objetivo, Análisis, Plan).
    """
    if not body.texto.strip():
        raise HTTPException(status_code=400, detail="El campo 'texto' no puede estar vacío.")

    try:
        resultado = process_soap(body.texto)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en procesamiento SOAP: {str(e)}")

    return resultado
