import io
import pytest
from unittest.mock import patch, MagicMock
from services.transcription import transcribe_audio


def test_transcribe_endpoint_no_file(client, doctor):
    # No enviar archivo
    r = client.post("/api/transcribe", headers=doctor)
    assert r.status_code == 422  # Validation Error por falta de form-data


def test_transcribe_endpoint_invalid_format(client, doctor):
    # Formato inválido (.txt)
    files = {"audio": ("test.txt", io.BytesIO(b"dummy data"), "text/plain")}
    r = client.post("/api/transcribe", files=files, headers=doctor)
    assert r.status_code == 400
    assert "Formato de audio no soportado" in r.json()["detail"]


@patch("services.transcription.DeepgramClient")
def test_transcribe_audio_timeout_passed(mock_deepgram_client):
    # Verificar que el timeout de 300.0 se pasa correctamente a DeepgramClient
    mock_instance = MagicMock()
    mock_deepgram_client.return_value = mock_instance
    
    # Mockear el método de transcripción de Deepgram
    mock_response = MagicMock()
    mock_response.results.channels[0].alternatives[0].transcript = "hola perro"
    mock_instance.listen.v1.media.transcribe_file.return_value = mock_response

    # Ejecutar la transcripción
    res = transcribe_audio(b"dummy_bytes", filename="audio.wav")
    
    assert res == "hola perro"
    # Verificar que se creó con timeout=300.0
    mock_deepgram_client.assert_called_once()
    _, kwargs = mock_deepgram_client.call_args
    assert kwargs.get("timeout") == 300.0
