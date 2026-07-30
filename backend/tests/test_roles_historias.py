"""Quién puede hacer qué: historias, recetas y módulos de tesis.

Son reglas de acceso, así que se prueban contra los endpoints reales con los
tokens de cada rol. Que el menú esconda una opción no prueba nada: lo que
importa es qué responde el servidor cuando alguien escribe la URL.

    cd backend
    python -m pytest tests/test_roles_historias.py -v
"""
import pytest
from sqlalchemy import text

from core.config import settings
from database import SessionLocal


def _paciente_id(client, admin):
    for cli in client.get("/api/clientes/", headers=admin).json():
        if cli.get("pacientes"):
            return cli["pacientes"][0]["id"]
    pytest.skip("se necesita al menos una mascota registrada")


def _id_veterinario(client, admin):
    doctores = client.get("/api/usuarios/doctores", headers=admin).json()
    assert doctores, "se necesita un veterinario activo"
    return doctores[0]["id"]


def _borrar_historia(historia_id):
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM historias_clinicas WHERE id = :i"), {"i": historia_id})
        db.commit()
    finally:
        db.close()


# ── Historias clínicas: la recepcionista también las llena ───────────────────

def test_la_recepcion_puede_registrar_una_historia(client, admin):
    """En consulta cargada el doctor dicta y sigue atendiendo. La alternativa
    real no es que la llene después, es que la consulta no quede registrada."""
    pid = _paciente_id(client, admin)
    vet = _id_veterinario(client, admin)
    r = client.post(f"/api/pacientes/{pid}/historias/", json={
        "motivo_consulta": "Prueba automatizada de rol",
        "veterinario_id": vet,
    }, headers=admin)
    assert r.status_code == 201, r.text
    h = r.json()
    try:
        # Firma el doctor indicado, no la recepcionista que la tecleó
        assert h["veterinario_id"] == vet
    finally:
        _borrar_historia(h["id"])


def test_la_recepcion_debe_indicar_que_doctor_atendio(client, admin):
    """Una historia sin veterinario responsable no sirve como registro clínico."""
    pid = _paciente_id(client, admin)
    r = client.post(f"/api/pacientes/{pid}/historias/", json={
        "motivo_consulta": "Sin doctor indicado",
    }, headers=admin)
    assert r.status_code == 422
    assert "veterinario" in r.json()["detail"].lower()


def test_no_se_puede_atribuir_la_consulta_a_cualquiera(client, admin):
    """Si valiera cualquier id, la firma clínica no significaría nada."""
    pid = _paciente_id(client, admin)
    # Un usuario que existe pero no es veterinario (la propia recepcionista)
    recepcion = next(u for u in client.get("/api/usuarios/", headers=admin).json()
                     if u["rol"] == "recepcionista")
    for vet_id in (recepcion["id"], 999999):
        r = client.post(f"/api/pacientes/{pid}/historias/", json={
            "motivo_consulta": "Atribución inválida",
            "veterinario_id": vet_id,
        }, headers=admin)
        assert r.status_code == 422, f"se aceptó veterinario_id={vet_id}"


def test_el_doctor_firma_su_propia_consulta(client, admin, doctor):
    """Nadie firma en nombre de otro: si escribe el veterinario, va su nombre
    aunque el formulario mande otro id."""
    pid = _paciente_id(client, admin)
    otro = _id_veterinario(client, admin)
    r = client.post(f"/api/pacientes/{pid}/historias/", json={
        "motivo_consulta": "Prueba de firma propia",
        "veterinario_id": otro,
    }, headers=doctor)
    assert r.status_code == 201, r.text
    h = r.json()
    try:
        assert h["veterinario_nombre"] == "QA Doctor", h["veterinario_nombre"]
    finally:
        _borrar_historia(h["id"])


def test_el_dictado_de_historias_lo_puede_usar_recepcion(client, admin):
    """Llenar la historia por voz es el flujo principal; si el pipeline de IA
    siguiera cerrado, "puede llenarla" sería solo teclearla a mano.

    Se comprueba la regla del middleware en vez de llamar al endpoint: cada
    llamada real gasta cuota de OpenAI/Deepgram.
    """
    import main
    assert main._es_ruta_clinica("/api/transcribe") is False
    assert main._es_ruta_clinica("/api/procesar-historia") is False
    assert main._es_ruta_clinica("/api/pacientes/1/historias/") is False
    # La receta sí sigue cerrada
    assert main._es_ruta_clinica("/api/procesar-receta") is True
    assert main._es_ruta_clinica("/api/pacientes/1/recetas/") is True


# ── Recetas: siguen siendo del veterinario ───────────────────────────────────

def test_la_recepcion_no_emite_recetas(client, admin):
    """Va firmada por un colegiado y con su número de colegiatura: no se delega."""
    pid = _paciente_id(client, admin)
    r = client.post(f"/api/pacientes/{pid}/recetas/", json={
        "items": [{"medicamento": "Amoxicilina", "dosis": "1 tableta"}],
    }, headers=admin)
    assert r.status_code == 403


def test_la_recepcion_sí_puede_leer_una_receta_ya_emitida(client, admin):
    """Para reimprimirla o reenviarla al cliente."""
    pid = _paciente_id(client, admin)
    assert client.get(f"/api/pacientes/{pid}/recetas/", headers=admin).status_code == 200


# ── Módulos de tesis apagados ────────────────────────────────────────────────

@pytest.mark.skipif(settings.modulos_tesis, reason="Los módulos de tesis están encendidos")
@pytest.mark.parametrize("ruta", [
    "/api/sus/", "/api/tam/", "/api/evaluadores/", "/api/encuestas/resumen",
])
def test_los_modulos_de_tesis_no_estan_montados(client, admin, ruta):
    """Esconderlos del menú dejaría los endpoints abiertos a quien escriba la
    URL; apagados no existen."""
    assert client.get(ruta, headers=admin).status_code == 404


@pytest.mark.skipif(settings.modulos_tesis, reason="Los módulos de tesis están encendidos")
def test_las_comparativas_de_tesis_tampoco_responden(client, admin):
    r = client.post("/api/comparar-extraccion", json={"texto": "prueba"}, headers=admin)
    assert r.status_code == 404
