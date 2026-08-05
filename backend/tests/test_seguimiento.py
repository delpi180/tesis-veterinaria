"""Seguimiento de vacunas y desparasitación.

Lo que se prueba acá salió de mirar los datos reales de la clínica:

- Siete dosis de vacuna registradas tenían siete nombres distintos, así que el
  consolidado "última dosis de cada vacuna" no agrupaba nada y una mascota
  vacunada podía figurar como pendiente para siempre.
- La próxima dosis era texto libre y el recordatorio solo entiende fechas: de
  esas siete dosis, solo dos generaban aviso.
- La desparasitación no tenía próxima fecha, siendo lo más recurrente de una
  clínica.

    cd backend
    python -m pytest tests/test_seguimiento.py -v
"""
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from core.vacunas import intervalo_dias, normalizar
from database import SessionLocal


# ── Catálogo ─────────────────────────────────────────────────────────────────

def test_el_catalogo_normaliza_las_variantes_de_una_misma_vacuna():
    """"triple", "Triple felina" y "trivalente" son la misma vacuna."""
    assert normalizar("triple") == "Triple felina"
    assert normalizar("Trivalente") == "Triple felina"
    assert normalizar("  TRIPLE FELINA ") == "Triple felina"
    assert normalizar("rabia") == "Antirrábica"
    assert normalizar("antirrabica") == "Antirrábica"


def test_una_vacuna_fuera_del_catalogo_se_conserva_tal_cual():
    """No se descarta lo que la clínica escriba: solo se agrupa lo conocido."""
    assert normalizar("Vacuna experimental X") == "Vacuna experimental X"
    assert normalizar(None) is None


def test_el_catalogo_sabe_cada_cuanto_toca_la_siguiente():
    assert intervalo_dias("Antirrábica") == 365
    assert intervalo_dias("triple") == 21          # también por alias
    assert intervalo_dias("Vacuna inventada") is None


def test_los_catalogos_se_sirven_al_formulario(client, admin):
    vac = client.get("/api/catalogos/vacunas", headers=admin)
    assert vac.status_code == 200
    nombres = [v["nombre"] for v in vac.json()]
    assert "Antirrábica" in nombres
    assert all(v.get("intervalo_dias") for v in vac.json())

    anti = client.get("/api/catalogos/antiparasitarios", headers=admin)
    assert anti.status_code == 200
    assert anti.json(), "el catálogo de antiparasitarios no puede venir vacío"


# ── Datos de prueba ──────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def paciente(client, admin):
    r = client.post("/api/clientes/", json={
        "dni": "90000009", "nombre": "QA Dueño Seguimiento", "telefono": "555999",
    }, headers=admin)
    assert r.status_code == 201, r.text
    cliente_id = r.json()["id"]
    p = client.post(f"/api/clientes/{cliente_id}/pacientes/", json={
        "nombre": "QASeguimiento", "especie": "Felino",
    }, headers=admin)
    assert p.status_code == 201, p.text
    paciente_id = p.json()["id"]

    yield paciente_id

    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM vacunas_avisadas WHERE paciente_id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM documentos_paciente WHERE paciente_id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM registros_clinicos WHERE paciente_id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM historias_clinicas WHERE paciente_id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM citas WHERE paciente_id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cliente_id})
        db.commit()
    finally:
        db.close()


def _vet(client, admin):
    return client.get("/api/usuarios/doctores", headers=admin).json()[0]["id"]


# ── Vacunas ──────────────────────────────────────────────────────────────────

def test_dos_grafias_de_la_misma_vacuna_son_una_sola_fila(client, admin, paciente):
    """Antes, "triple" y "Triple felina" eran dos vacunas distintas: la mascota
    aparecía con una pendiente aunque acabara de recibir la dosis."""
    vet = _vet(client, admin)
    hoy = date.today()
    for nombre, aplicada in (("triple", hoy - timedelta(days=60)), ("Triple felina", hoy - timedelta(days=10))):
        r = client.post(f"/api/pacientes/{paciente}/historias/", json={
            "fecha": aplicada.isoformat(),
            "veterinario_id": vet,
            "vacunas_items": [{"vacuna": nombre, "proxima_dosis": (aplicada + timedelta(days=21)).isoformat()}],
        }, headers=admin)
        assert r.status_code == 201, r.text

    filas = [v for v in client.get("/api/dashboard/vacunas", headers=admin).json()
             if v["paciente_id"] == paciente]
    assert len(filas) == 1, filas
    fila = filas[0]
    assert fila["vacuna"] == "Triple felina"     # nombre canónico, no lo tecleado
    assert fila["tipo"] == "vacuna"
    # Se queda con la más reciente, que es la que manda para la próxima dosis
    assert fila["fecha_aplicada"].startswith((hoy - timedelta(days=10)).isoformat())


# ── Desparasitación ──────────────────────────────────────────────────────────

def test_la_desparasitacion_entra_en_la_misma_bandeja(client, admin, paciente):
    vencida = date.today() - timedelta(days=3)
    r = client.post(f"/api/pacientes/{paciente}/registros/", json={
        "tipo": "antiparasitario",
        "fecha": (vencida - timedelta(days=90)).isoformat(),
        "proxima_fecha": vencida.isoformat(),
        "producto": "Desparasitación interna",
    }, headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["proxima_fecha"] == vencida.isoformat()

    fila = next(v for v in client.get("/api/dashboard/vacunas", headers=admin).json()
                if v["paciente_id"] == paciente and v["tipo"] == "antiparasitario")
    assert fila["estado"] == "vencida"
    assert fila["proxima_dosis"] == vencida.isoformat()
    assert fila["telefono"], "recepción necesita el teléfono para llamar"


def test_una_desparasitacion_sin_proxima_fecha_no_genera_pendiente(client, admin, paciente):
    """Registrar que se hizo no es lo mismo que programar la siguiente."""
    antes = len([v for v in client.get("/api/dashboard/vacunas", headers=admin).json()
                 if v["paciente_id"] == paciente and v["tipo"] == "antiparasitario"])
    r = client.post(f"/api/pacientes/{paciente}/registros/", json={
        "tipo": "estetica", "producto": "Baño QA",
    }, headers=admin)
    assert r.status_code == 201, r.text
    despues = len([v for v in client.get("/api/dashboard/vacunas", headers=admin).json()
                   if v["paciente_id"] == paciente and v["tipo"] == "antiparasitario"])
    assert despues == antes


def test_avisar_una_desparasitacion_no_silencia_la_vacuna(client, admin, paciente):
    """El aviso se guarda por tipo: si compartieran clave, marcar "ya llamé"
    por la desparasitación borraría también el recordatorio de la vacuna."""
    pendientes = [v for v in client.get("/api/dashboard/vacunas", headers=admin).json()
                  if v["paciente_id"] == paciente]
    anti = next(v for v in pendientes if v["tipo"] == "antiparasitario")
    vac = next(v for v in pendientes if v["tipo"] == "vacuna")

    r = client.post("/api/dashboard/vacunas/avisar", json={
        "paciente_id": paciente, "vacuna": anti["vacuna"],
        "proxima_dosis": anti["proxima_dosis"], "tipo": "antiparasitario",
    }, headers=admin)
    assert r.status_code == 201, r.text

    despues = {(v["tipo"]): v for v in client.get("/api/dashboard/vacunas", headers=admin).json()
               if v["paciente_id"] == paciente}
    assert despues["antiparasitario"]["avisado"] is True
    assert despues["vacuna"]["avisado"] is False, "la vacuna quedó marcada por el aviso de otra cosa"

    # Y el panel de recepción deja de mostrar solo la ya avisada
    resumen = client.get("/api/dashboard/resumen", headers=admin).json()
    mios = [v for v in resumen["vacunas_proximas"] if v["paciente_id"] == paciente]
    assert not any(v["tipo"] == "antiparasitario" for v in mios)
    assert any(v["tipo"] == "vacuna" for v in mios) or vac["estado"] == "programada"
