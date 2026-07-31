"""
Pruebas del módulo de Recetas: permisos, no-duplicación al guardar, y el
endpoint de extracción por voz (/api/procesar-receta), sin gastar cuota real
de OpenAI (se verifica solo el filtro de rol y el rate-limit, que rechazan la
petición ANTES de llamar al modelo).

    cd backend
    python -m pytest tests/test_recetas.py -v
"""
from sqlalchemy import text

from database import SessionLocal
from services.receta_extractor import _limpiar_vacios, _quitar_repetidos


def _crear_paciente(client, admin, sufijo, dni):
    cli = client.post("/api/clientes/", json={"nombre": f"QA Dueño Receta {sufijo}", "dni": dni}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/",
                       json={"nombre": f"QA Mascota Receta {sufijo}", "especie": "Canino"}, headers=admin).json()
    return cli, pac


def _borrar(client, admin, cli, pac):
    client.delete(f"/api/pacientes/{pac['id']}", headers=admin)
    db = SessionLocal()
    db.execute(text("DELETE FROM clientes WHERE id=:c"), {"c": cli["id"]})
    db.commit(); db.close()


# ── Permisos ─────────────────────────────────────────────────────────────────

def test_solo_veterinario_emite_recetas(client, admin, doctor):
    """La recepción puede leer recetas, pero no crearlas/editarlas/borrarlas."""
    cli, pac = _crear_paciente(client, admin, "permisos", "70011001")
    try:
        payload = {"items": [{"medicamento": "Meloxicam", "dosis": "0.1 mg/kg"}]}
        r_admin = client.post(f"/api/pacientes/{pac['id']}/recetas/", json=payload, headers=admin)
        assert r_admin.status_code == 403

        r_doc = client.post(f"/api/pacientes/{pac['id']}/recetas/", json=payload, headers=doctor)
        assert r_doc.status_code == 201

        # la recepción sí puede leerlas
        assert client.get(f"/api/pacientes/{pac['id']}/recetas/", headers=admin).status_code == 200
    finally:
        _borrar(client, admin, cli, pac)


def test_procesar_receta_endpoint_solo_veterinario(client, admin):
    """El dictado de recetas está reservado al veterinario (igual que crearlas).

    No se ejercita el modelo de IA: el filtro de rol rechaza la petición antes
    de llegar a OpenAI, así que esta prueba no tiene costo.
    """
    r = client.post("/api/procesar-receta", json={"texto": "amoxicilina 250mg cada 12 horas"}, headers=admin)
    assert r.status_code == 403


# ── No duplicar al guardar (doble clic / reintento de red) ──────────────────

def test_guardar_receta_no_duplica_en_doble_envio(client, admin, doctor):
    """Enviar la misma receta dos veces seguidas no crea dos registros.

    Simula un doble clic o un reintento de red tras un timeout: el backend
    detecta que ya existe una receta idéntica del mismo veterinario para este
    paciente hace unos segundos y devuelve esa en vez de duplicarla.
    """
    cli, pac = _crear_paciente(client, admin, "dup", "70011002")
    try:
        payload = {
            "diagnostico": "Otitis externa",
            "items": [{"medicamento": "Enrofloxacina", "dosis": "5 mg/kg", "frecuencia": "c/24h"}],
        }
        r1 = client.post(f"/api/pacientes/{pac['id']}/recetas/", json=payload, headers=doctor)
        r2 = client.post(f"/api/pacientes/{pac['id']}/recetas/", json=payload, headers=doctor)
        assert r1.status_code == 201 and r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"], "el reenvío idéntico debió devolver la misma receta, no crear otra"

        recetas = client.get(f"/api/pacientes/{pac['id']}/recetas/", headers=doctor).json()
        assert len(recetas) == 1

        # Una receta con contenido DISTINTO sí debe crear un registro nuevo
        payload2 = {**payload, "diagnostico": "Otitis externa bilateral"}
        r3 = client.post(f"/api/pacientes/{pac['id']}/recetas/", json=payload2, headers=doctor)
        assert r3.status_code == 201
        assert r3.json()["id"] != r1.json()["id"]
    finally:
        _borrar(client, admin, cli, pac)


# ── Limpieza de la lista dictada (lado del extractor de IA) ─────────────────

def test_dos_pautas_del_mismo_farmaco_se_conservan():
    """Antes esto fusionaba por NOMBRE y se quedaba con la última mención.

    La idea era absorber las correcciones del veterinario, pero el modelo ya
    las resuelve solo (devuelve una sola línea). Lo que sí hacía era borrar
    pautas legítimas: la dosis de carga de un fenobarbital, o la inyectable
    cuando además va la presentación oral. Un medicamento recetado que
    desaparece sin aviso es peor que uno repetido: lo repetido se ve.
    """
    items = [
        {"medicamento": "Fenobarbital", "dosis": "5 mg/kg", "via": None,
         "frecuencia": None, "duracion": "hoy"},
        {"medicamento": "fenobarbital", "dosis": "2.5 mg/kg", "via": None,
         "frecuencia": "c/12h", "duracion": "permanente"},
    ]
    resultado = _quitar_repetidos(items)
    assert len(resultado) == 2, "se perdió la dosis de carga"


def test_se_descarta_lo_que_es_identico():
    """Una línea repetida campo por campo no aporta nada y confunde al imprimir."""
    fila = {"medicamento": "Meloxicam", "dosis": "0.1 mg/kg", "via": "Oral",
            "frecuencia": "c/24h", "duracion": "3 días"}
    resultado = _quitar_repetidos([fila, dict(fila), {**fila, "medicamento": "Amoxicilina"}])
    assert len(resultado) == 2


def test_se_ignoran_las_lineas_sin_medicamento():
    assert _quitar_repetidos([{"medicamento": "", "dosis": "5 mg"}]) == []


def test_la_palabra_null_no_llega_a_la_receta_impresa():
    """El modelo a veces escribe "null" como texto; sin limpiarlo, la boleta
    que recibe el cliente dice literalmente "Vía: null"."""
    limpio = _limpiar_vacios({"medicamento": "Amoxicilina", "dosis": "4 mg/kg",
                              "via": "null", "frecuencia": "N/A", "duracion": "-"})
    assert limpio["via"] is None
    assert limpio["frecuencia"] is None
    assert limpio["duracion"] is None
    assert limpio["medicamento"] == "Amoxicilina"
