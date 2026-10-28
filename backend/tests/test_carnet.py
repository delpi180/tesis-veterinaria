"""
Carnet público de la mascota: el dueño lo ve con un enlace, sin sesión.

Lo importante no es que funcione sino que no filtre: un enlace compartido por
WhatsApp se reenvía, así que solo puede mostrar el carnet.

    cd backend
    DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/vet_demo python -m pytest tests/test_carnet.py -v
"""
from sqlalchemy import text

from database import SessionLocal


def _limpiar(cli, pac, ip=None):
    db = SessionLocal()
    db.execute(text("DELETE FROM historias_clinicas WHERE paciente_id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cli["id"]})
    if ip:
        db.execute(text("DELETE FROM rate_limit_hits WHERE key = :k"), {"k": f"carnet:{ip}"})
    db.commit(); db.close()


def _mascota(client, admin, doctor, dni):
    cli = client.post("/api/clientes/", json={
        "nombre": "QA Dueño Secreto", "dni": dni, "telefono": "987654321",
    }, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", json={"nombre": "QA Carnet", "especie": "Canino"}, headers=admin).json()
    client.post(f"/api/pacientes/{pac['id']}/historias/", json={
        "motivo_consulta": "Vacunación", "diagnostico_presuntivo": "DIAGNOSTICO_CONFIDENCIAL",
        "vacunas_items": [{"vacuna": "Antirrábica", "proxima_dosis": "2020-01-01"}],
    }, headers=doctor)
    return cli, pac


def test_el_dueno_ve_el_carnet_sin_sesion_y_solo_el_carnet(client, admin, doctor):
    cli, pac = _mascota(client, admin, doctor, "60044001")
    try:
        enlace = client.post(f"/api/carnet/paciente/{pac['id']}", headers=admin)
        assert enlace.status_code == 200
        token = enlace.json()["token"]
        assert len(token) >= 16 and enlace.json()["ruta"] == f"/carnet/{token}"

        # El mismo enlace cada vez: si se reenviara otro, el ya mandado quedaría muerto
        assert client.post(f"/api/carnet/paciente/{pac['id']}", headers=admin).json()["token"] == token

        r = client.get(f"/api/carnet/publico/{token}")          # sin Authorization
        assert r.status_code == 200
        c = r.json()
        assert c["mascota"]["nombre"] == "QA Carnet"
        assert [v["nombre"] for v in c["vacunas"]] == ["Antirrábica"]
        assert c["vacunas"][0]["estado"] == "vencida"
        assert r.headers["cache-control"] == "no-store"
        assert "noindex" in r.headers["x-robots-tag"]

        # Lo que NO puede salir por un enlace que se reenvía
        cuerpo = r.text
        for secreto in ("QA Dueño Secreto", "987654321", "60044001", "DIAGNOSTICO_CONFIDENCIAL"):
            assert secreto not in cuerpo, f"el carnet público filtró: {secreto}"
    finally:
        _limpiar(cli, pac)


def test_crear_o_revocar_el_enlace_exige_sesion(client, admin, doctor):
    cli, pac = _mascota(client, admin, doctor, "60044002")
    try:
        assert client.post(f"/api/carnet/paciente/{pac['id']}").status_code == 401
        assert client.delete(f"/api/carnet/paciente/{pac['id']}").status_code == 401
    finally:
        _limpiar(cli, pac)


def test_revocar_mata_el_enlace_y_se_puede_crear_otro(client, admin, doctor):
    cli, pac = _mascota(client, admin, doctor, "60044003")
    try:
        viejo = client.post(f"/api/carnet/paciente/{pac['id']}", headers=admin).json()["token"]
        assert client.delete(f"/api/carnet/paciente/{pac['id']}", headers=admin).status_code == 204
        assert client.get(f"/api/carnet/publico/{viejo}").status_code == 404

        nuevo = client.post(f"/api/carnet/paciente/{pac['id']}", headers=admin).json()["token"]
        assert nuevo != viejo
        assert client.get(f"/api/carnet/publico/{nuevo}").status_code == 200
        assert client.get(f"/api/carnet/publico/{viejo}").status_code == 404
    finally:
        _limpiar(cli, pac)


def test_codigos_inventados_dan_404_y_tras_muchos_intentos_se_bloquea(client):
    ip = "203.0.113.77"
    h = {"x-forwarded-for": ip}
    try:
        assert client.get("/api/carnet/publico/corto", headers=h).status_code == 404
        for _ in range(25):
            client.get("/api/carnet/publico/x" + "a" * 30, headers=h)
        assert client.get("/api/carnet/publico/x" + "b" * 30, headers=h).status_code == 429
    finally:
        db = SessionLocal()
        db.execute(text("DELETE FROM rate_limit_hits WHERE key = :k"), {"k": f"carnet:{ip}"})
        db.commit(); db.close()


def test_mascota_inactiva_no_muestra_carnet(client, admin, doctor):
    cli, pac = _mascota(client, admin, doctor, "60044004")
    try:
        token = client.post(f"/api/carnet/paciente/{pac['id']}", headers=admin).json()["token"]
        db = SessionLocal()
        db.execute(text("UPDATE pacientes SET activo = false WHERE id = :p"), {"p": pac["id"]})
        db.commit(); db.close()
        assert client.get(f"/api/carnet/publico/{token}").status_code == 404
    finally:
        _limpiar(cli, pac)
