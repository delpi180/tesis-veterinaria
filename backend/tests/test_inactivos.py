"""
Mascotas que dejaron de venir: a quién escribirle para recuperarlas.

    cd backend
    DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/vet_demo python -m pytest tests/test_inactivos.py -v
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from database import SessionLocal


def _mascota(client, admin, doctor, dni, hace_dias=None):
    cli = client.post("/api/clientes/", json={"nombre": f"QA Inactivo {dni}", "dni": dni, "telefono": "987000111"}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", json={"nombre": f"QA Mascota {dni}", "especie": "Canino"}, headers=admin).json()
    if hace_dias is not None:
        fecha = (datetime.now(timezone.utc) - timedelta(days=hace_dias)).isoformat()
        r = client.post(f"/api/pacientes/{pac['id']}/historias/", json={"motivo_consulta": "Control", "fecha": fecha}, headers=doctor)
        assert r.status_code == 201, r.text
    return cli, pac


def _limpiar(*pares):
    db = SessionLocal()
    for cli, pac in pares:
        for tabla in ("citas", "historias_clinicas"):
            db.execute(text(f"DELETE FROM {tabla} WHERE paciente_id = :p"), {"p": pac["id"]})
        db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": pac["id"]})
        db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cli["id"]})
    db.commit(); db.close()


def _ids(client, admin, **q):
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    return {x["paciente_id"]: x for x in client.get(f"/api/pacientes/inactivos?{qs}", headers=admin).json()}


def test_solo_aparece_quien_vino_alguna_vez_y_lleva_meses_sin_volver(client, admin, doctor):
    perdida = _mascota(client, admin, doctor, "60055001", hace_dias=430)       # 14 meses
    reciente = _mascota(client, admin, doctor, "60055002", hace_dias=60)       # vino hace 2 meses
    nunca = _mascota(client, admin, doctor, "60055003")                        # nunca se atendió
    try:
        r = _ids(client, admin, meses=12, limit=500)
        assert perdida[1]["id"] in r
        assert r[perdida[1]["id"]]["meses"] == 14
        assert r[perdida[1]["id"]]["telefono"] == "987000111"
        assert reciente[1]["id"] not in r
        assert nunca[1]["id"] not in r
    finally:
        _limpiar(perdida, reciente, nunca)


def test_con_una_cita_proxima_ya_esta_volviendo(client, admin, doctor):
    volviendo = _mascota(client, admin, doctor, "60055004", hace_dias=500)
    try:
        assert volviendo[1]["id"] in _ids(client, admin, meses=12, limit=500)
        manana = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r = client.post("/api/citas/", json={"paciente_id": volviendo[1]["id"], "fecha_hora": manana, "motivo": "Control"}, headers=admin)
        assert r.status_code == 201, r.text
        assert volviendo[1]["id"] not in _ids(client, admin, meses=12, limit=500)
    finally:
        _limpiar(volviendo)


def test_mascota_dada_de_baja_no_se_persigue(client, admin, doctor):
    baja = _mascota(client, admin, doctor, "60055005", hace_dias=500)
    try:
        db = SessionLocal()
        db.execute(text("UPDATE pacientes SET activo = false WHERE id = :p"), {"p": baja[1]["id"]})
        db.commit(); db.close()
        assert baja[1]["id"] not in _ids(client, admin, meses=12, limit=500)
    finally:
        _limpiar(baja)


def test_la_ventana_de_meses_se_puede_ajustar(client, admin, doctor):
    m = _mascota(client, admin, doctor, "60055006", hace_dias=200)             # unos 7 meses
    try:
        assert m[1]["id"] not in _ids(client, admin, meses=12, limit=500)
        assert m[1]["id"] in _ids(client, admin, meses=6, limit=500)
    finally:
        _limpiar(m)


def test_marcar_avisada_la_saca_de_la_lista_y_deshacer_la_devuelve(client, admin, doctor):
    m = _mascota(client, admin, doctor, "60055007", hace_dias=500)
    try:
        caso = _ids(client, admin, meses=12, limit=500)[m[1]["id"]]
        aviso = {"paciente_id": m[1]["id"], "vacuna": "Reactivación", "proxima_dosis": caso["ultima_visita"], "tipo": "reactivacion"}
        assert client.post("/api/dashboard/vacunas/avisar", json=aviso, headers=admin).status_code == 201
        assert m[1]["id"] not in _ids(client, admin, meses=12, limit=500)

        # Deshacer lo devuelve a la lista
        q = "&".join(f"{k}={v}" for k, v in {**aviso}.items())
        assert client.delete(f"/api/dashboard/vacunas/avisar?{q}", headers=admin).status_code == 204
        assert m[1]["id"] in _ids(client, admin, meses=12, limit=500)
    finally:
        db = SessionLocal()
        db.execute(text("DELETE FROM vacunas_avisadas WHERE paciente_id = :p"), {"p": m[1]["id"]})
        db.commit(); db.close()
        _limpiar(m)
