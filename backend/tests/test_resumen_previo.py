"""
Resumen previo a la consulta: junta lo ya registrado de una mascota, sin IA.

    cd backend
    DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/vet_demo python -m pytest tests/test_resumen_previo.py -v
"""
from sqlalchemy import text

from database import SessionLocal


def _limpiar(cli, pac):
    db = SessionLocal()
    for tabla in ("tratamientos", "registros_clinicos", "historias_clinicas", "citas"):
        db.execute(text(f"DELETE FROM {tabla} WHERE paciente_id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cli["id"]})
    db.commit(); db.close()


def test_resumen_previo_junta_lo_registrado(client, admin, doctor):
    cli = client.post("/api/clientes/", json={"nombre": "QA Resumen Previo", "dni": "60022001"}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", json={
        "nombre": "QA Resumen", "especie": "Canino", "alergias": "Penicilina",
    }, headers=admin).json()
    try:
        # Mascota nueva: no hay nada que mostrar, pero tampoco falla
        vacio = client.get(f"/api/pacientes/{pac['id']}/resumen-previo", headers=doctor)
        assert vacio.status_code == 200
        assert vacio.json()["ultima_visita"] is None
        assert vacio.json()["total_consultas"] == 0

        client.post(f"/api/pacientes/{pac['id']}/historias/", json={
            "motivo_consulta": "Control", "peso_kg": 10,
        }, headers=doctor)
        client.post(f"/api/pacientes/{pac['id']}/historias/", json={
            "motivo_consulta": "Vómitos", "diagnostico_presuntivo": "Gastroenteritis", "peso_kg": 11.5,
            "vacunas_items": [{"vacuna": "Antirrábica", "proxima_dosis": "2020-01-01"}],
            "tratamiento_items": [{"medicamento": "Metronidazol", "dosis": "15 mg/kg", "duracion_dias": 30}],
        }, headers=doctor)

        r = client.get(f"/api/pacientes/{pac['id']}/resumen-previo", headers=doctor).json()
        assert r["alergias"] == "Penicilina"
        assert r["total_consultas"] == 2
        assert r["ultima_visita"]["motivo"] == "Vómitos"
        assert r["ultima_visita"]["diagnostico"] == "Gastroenteritis"
        assert r["peso"]["kg"] == 11.5 and r["peso"]["cambio_kg"] == 1.5
        assert [t["medicamento"] for t in r["tratamientos_en_curso"]] == ["Metronidazol"]
        vac = [p for p in r["pendientes"] if p["tipo"] == "vacuna"]
        assert len(vac) == 1 and vac[0]["vencida"] is True
    finally:
        _limpiar(cli, pac)


def test_resumen_previo_de_mascota_inexistente_es_404(client, doctor):
    assert client.get("/api/pacientes/999999999/resumen-previo", headers=doctor).status_code == 404
