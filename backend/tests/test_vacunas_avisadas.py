"""
"Marcar como avisado" para los recordatorios de vacunación.

Antes no había forma de anotar que ya se contactó al dueño sin editar la
historia clínica: la misma vacuna vencida aparecía todos los días para
siempre en el panel de la portada.

    cd backend
    python -m pytest tests/test_vacunas_avisadas.py -v
"""
from sqlalchemy import text

from database import SessionLocal


def _crear_paciente_con_vacuna(client, admin, doctor, sufijo, dni, proxima_dosis):
    cli = client.post("/api/clientes/", json={"nombre": f"QA Vacuna {sufijo}", "dni": dni}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/",
                      json={"nombre": f"QA Mascota Vacuna {sufijo}", "especie": "Canino"}, headers=admin).json()
    hist = client.post(f"/api/pacientes/{pac['id']}/historias/", json={
        "motivo_consulta": "Vacunación",
        "vacunas_items": [{"vacuna": f"VacunaQA{sufijo}", "proxima_dosis": proxima_dosis}],
    }, headers=doctor).json()
    return cli, pac, hist


def _limpiar(cli, pac):
    db = SessionLocal()
    db.execute(text("DELETE FROM vacunas_avisadas WHERE paciente_id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM historias_clinicas WHERE paciente_id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cli["id"]})
    db.commit(); db.close()


def test_marcar_avisado_lo_saca_de_la_portada_pero_no_del_registro(client, admin, doctor):
    cli, pac, _ = _crear_paciente_con_vacuna(client, admin, doctor, "Avisar", "60011001", "2020-01-01")
    try:
        resumen = client.get("/api/dashboard/resumen", headers=admin).json()
        antes = [v for v in resumen["vacunas_proximas"] if v["paciente_id"] == pac["id"]]
        assert len(antes) == 1
        item = antes[0]
        assert item["vencida"] is True   # 2020-01-01 ya pasó

        r = client.post("/api/dashboard/vacunas/avisar", json={
            "paciente_id": item["paciente_id"], "vacuna": item["vacuna"], "proxima_dosis": item["proxima_dosis"],
        }, headers=admin)
        assert r.status_code == 201

        # Desaparece de la portada (panel de "por hacer")
        resumen2 = client.get("/api/dashboard/resumen", headers=admin).json()
        assert not any(v["paciente_id"] == pac["id"] for v in resumen2["vacunas_proximas"])

        # Pero el registro completo de Vacunación la conserva, marcada
        registro = client.get("/api/dashboard/vacunas", headers=admin).json()
        fila = next(v for v in registro if v["paciente_id"] == pac["id"])
        assert fila["avisado"] is True

        # Un doble clic no debe fallar
        r2 = client.post("/api/dashboard/vacunas/avisar", json={
            "paciente_id": item["paciente_id"], "vacuna": item["vacuna"], "proxima_dosis": item["proxima_dosis"],
        }, headers=admin)
        assert r2.status_code == 201

        # Deshacer la restaura en la portada
        r3 = client.delete("/api/dashboard/vacunas/avisar", params={
            "paciente_id": item["paciente_id"], "vacuna": item["vacuna"], "proxima_dosis": item["proxima_dosis"],
        }, headers=admin)
        assert r3.status_code == 204
        resumen3 = client.get("/api/dashboard/resumen", headers=admin).json()
        assert any(v["paciente_id"] == pac["id"] for v in resumen3["vacunas_proximas"])
    finally:
        _limpiar(cli, pac)


def test_nueva_fecha_de_la_misma_vacuna_vuelve_a_avisar(client, admin, doctor):
    """Si el veterinario aplica la vacuna y registra una fecha nueva, es un
    recordatorio distinto: no debe quedar silenciado por el aviso anterior."""
    cli, pac, hist = _crear_paciente_con_vacuna(client, admin, doctor, "Renovar", "60011002", "2020-01-01")
    try:
        client.post("/api/dashboard/vacunas/avisar", json={
            "paciente_id": pac["id"], "vacuna": "VacunaQARenovar", "proxima_dosis": "2020-01-01",
        }, headers=admin)

        # El veterinario aplica la vacuna y pone una fecha nueva
        client.put(f"/api/pacientes/{pac['id']}/historias/{hist['id']}", json={
            "vacunas_items": [{"vacuna": "VacunaQARenovar", "proxima_dosis": "2099-01-01"}],
        }, headers=doctor)

        resumen = client.get("/api/dashboard/resumen", headers=admin).json()
        fila = next((v for v in resumen["vacunas_proximas"] if v["paciente_id"] == pac["id"]), None)
        assert fila is not None, "la nueva fecha debió reaparecer en la portada, no quedar silenciada"
        assert fila["proxima_dosis"] == "2099-01-01"
    finally:
        _limpiar(cli, pac)
