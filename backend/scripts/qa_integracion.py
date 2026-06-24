"""
QA de integración end-to-end.
Recorre el sistema como un usuario real y verifica que cada módulo esté
CONECTADO con los demás (no de adorno). Crea datos de prueba y los limpia.

Uso (con el backend corriendo en localhost:8000):
    cd backend
    venv/Scripts/python.exe scripts/qa_integracion.py
"""
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import SessionLocal   # noqa: E402
from sqlalchemy import text         # noqa: E402

BASE = "http://127.0.0.1:8000"
PWD = "vetlospinos"

ok = 0
fail = 0


def check(nombre, condicion, extra=""):
    global ok, fail
    if condicion:
        ok += 1
        print(f"  [OK]   {nombre} {extra}")
    else:
        fail += 1
        print(f"  [FAIL] {nombre} {extra}")


def _limpiar_asistencia(doc_id):
    db = SessionLocal()
    db.execute(text("DELETE FROM asistencias WHERE usuario_id=:u"), {"u": doc_id})
    db.commit(); db.close()


def main():
    c = httpx.Client(base_url=BASE, timeout=30)

    # ── AUTH ──────────────────────────────────────────────────────────────
    print("\n== Autenticacion y roles ==")
    radm = c.post("/api/auth/login", json={"usuario": "admin", "password": PWD})
    rdoc = c.post("/api/auth/login", json={"usuario": "doctor", "password": PWD})
    check("login admin (recepcionista)", radm.status_code == 200 and radm.json()["rol"] == "recepcionista")
    check("login doctor (veterinario)", rdoc.status_code == 200 and rdoc.json()["rol"] == "veterinario")
    A = {"Authorization": f"Bearer {radm.json()['token']}"}
    D = {"Authorization": f"Bearer {rdoc.json()['token']}"}
    doc_id = next(d["id"] for d in c.get("/api/usuarios/doctores", headers=A).json() if d["nombre"] == "Dr. Veterinario")
    check("doctor bloqueado de bitacora (403)", c.get("/api/actividad/", headers=D).status_code == 403)
    check("recepcionista bloqueada de mi-panel (403)", c.get("/api/mi-panel/", headers=A).status_code == 403)

    # ── CLIENTE + PACIENTE ────────────────────────────────────────────────
    print("\n== Clientes y pacientes ==")
    cli = c.post("/api/clientes/", json={"nombre": "QA Conexion", "dni": "98765432", "telefono": "999000111"}, headers=A).json()
    pac = c.post(f"/api/clientes/{cli['id']}/pacientes/", json={"nombre": "QAtest", "especie": "Canino"}, headers=A).json()
    check("cliente creado", "id" in cli)
    check("paciente creado y ligado al cliente", pac.get("cliente_id") == cli["id"])
    clientes = c.get("/api/clientes/", headers=A).json()
    check("cliente aparece en el listado", any(x["id"] == cli["id"] for x in clientes))

    # ── PRODUCTO + SERVICIO ───────────────────────────────────────────────
    print("\n== Inventario y servicios ==")
    prod = c.post("/api/productos/", json={"nombre": "QA Producto", "categoria": "medicamento", "precio": 20, "stock": 10}, headers=A).json()
    serv = c.post("/api/servicios/", json={"nombre": "QA Servicio", "precio": 30}, headers=A).json()
    check("producto creado con stock 10", prod.get("stock") == 10)
    check("servicio creado", "id" in serv)

    # ── VENTA (conecta cliente + producto + servicio + stock + kardex) ─────
    print("\n== Venta (conexion cliente/producto/servicio/stock/kardex) ==")
    venta = c.post("/api/ventas/", json={
        "cliente_id": cli["id"], "metodo_pago": "yape",
        "items": [{"producto_id": prod["id"], "cantidad": 2}, {"servicio_id": serv["id"], "cantidad": 1}],
    }, headers=A)
    vok = venta.status_code == 201
    check("venta registrada", vok)
    v = venta.json() if vok else {}
    if vok:
        check("total correcto (2*20 + 30 = 70)", float(v["total"]) == 70.0, f"-> {v['total']}")
        stock_post = c.get(f"/api/productos/{prod['id']}", headers=A).json()["stock"]
        check("stock descontado (10 -> 8)", stock_post == 8, f"-> {stock_post}")
        movs = c.get(f"/api/productos/{prod['id']}/movimientos", headers=A).json()
        check("kardex registra salida por venta", any(m["tipo"] == "salida" for m in movs))

    # ── TURNO asignado al doctor (conecta agenda + dashboard + mi-panel) ───
    print("\n== Turnos (conexion agenda/dashboard/mi-panel) ==")
    cita = c.post("/api/citas/", json={
        "paciente_id": pac["id"], "fecha_hora": "2027-03-10T10:00:00",
        "motivo": "QA control", "veterinario_id": doc_id,
    }, headers=A).json()
    check("turno creado y asignado al doctor", cita.get("veterinario_nombre") == "Dr. Veterinario")
    panel = c.get("/api/mi-panel/", headers=D).json()
    check("turno aparece en Mi panel del doctor", any(t["id"] == cita["id"] for t in panel["mis_turnos"]))

    # ── HISTORIA por el doctor (conecta autoria + mi-panel + reportes) ────
    print("\n== Historia clinica (autoria/mi-panel/reportes) ==")
    h = c.post(f"/api/pacientes/{pac['id']}/historias/", json={"motivo_consulta": "QA atencion", "peso_kg": 12.0}, headers=D).json()
    check("historia firmada por el doctor", h.get("veterinario_nombre") == "Dr. Veterinario")
    reread = c.get(f"/api/pacientes/{pac['id']}/historias/{h['id']}", headers=D).json()
    check("historia persiste al releer", reread.get("motivo_consulta") == "QA atencion")
    panel2 = c.get("/api/mi-panel/", headers=D).json()
    check("historia cuenta en Mi panel del doctor", panel2["resumen_historias"]["total"] >= 1)

    # ── ASISTENCIA (conecta marcacion + dashboard presentes + mi-panel) ───
    print("\n== Asistencia (marcacion/presentes/mi-panel) ==")
    _limpiar_asistencia(doc_id)
    ing = c.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=A)
    check("ingreso registrado", ing.status_code == 201)
    presentes = c.get("/api/dashboard/resumen", headers=A).json()["presentes"]
    check("doctor aparece en 'en turno ahora' (dashboard)", any(p["usuario_id"] == doc_id for p in presentes))
    asis_panel = c.get("/api/mi-panel/", headers=D).json()["asistencia_hoy"]
    check("Mi panel del doctor muestra su asistencia de hoy", asis_panel["marcado"] is True)

    # ── BITACORA (conecta middleware -> todas las acciones) ───────────────
    print("\n== Bitacora de actividad (trazabilidad) ==")
    acts = c.get("/api/actividad/?limite=60", headers=A).json()
    acciones = {a["accion"] for a in acts}
    check("registra creacion de cliente", "Registró un cliente" in acciones)
    check("registra venta", "Registró una venta" in acciones)
    check("registra historia clinica", "Registró una historia clínica" in acciones)
    check("registra ingreso de asistencia", "Marcó ingreso de asistencia" in acciones)
    check("detalle conectado (turno -> nombre paciente)", any(a["accion"] == "Creó un turno" and a.get("detalle") == "QAtest" for a in acts))

    # ── REPORTES (conecta ventas + historias) ─────────────────────────────
    print("\n== Reportes (conexion ventas/historias) ==")
    rep = c.get("/api/dashboard/reportes", headers=A).json()
    check("reporte: producto vendido aparece", any(r["nombre"] == "QA Producto" for r in rep["top_productos"]))
    check("reporte: servicio vendido aparece", any(r["nombre"] == "QA Servicio" for r in rep["top_servicios"]))
    check("reporte: atenciones del doctor cuentan", any(r["doctor"] == "Dr. Veterinario" for r in rep["atenciones_por_doctor"]))

    # ── CAJA + DASHBOARD + BUSQUEDA + TESIS ───────────────────────────────
    print("\n== Caja, dashboard, busqueda y modulos de tesis ==")
    caja = c.get("/api/dashboard/cierre-caja", headers=A).json()
    check("cierre de caja con 4 metodos de pago", {m["metodo"] for m in caja["por_metodo"]} == {"efectivo", "tarjeta", "yape", "plin"})
    check("busqueda global responde", c.get("/api/busqueda/?q=QA", headers=A).status_code == 200)
    check("encuestas/resumen (tesis) responde", c.get("/api/encuestas/resumen", headers=A).status_code == 200)
    check("encuestas/tiempos (tesis) responde", c.get("/api/encuestas/tiempos", headers=A).status_code == 200)
    check("encuestas/estadisticas (tesis) responde", c.get("/api/encuestas/estadisticas", headers=A).status_code == 200)

    # ── LIMPIEZA ──────────────────────────────────────────────────────────
    print("\n== Limpieza de datos de prueba ==")
    _limpiar_asistencia(doc_id)
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id=:p"), {"p": prod["id"]})
        if vok:
            db.execute(text("DELETE FROM venta_items WHERE venta_id=:v"), {"v": v["id"]})
            db.execute(text("DELETE FROM ventas WHERE id=:v"), {"v": v["id"]})
        db.execute(text("DELETE FROM productos WHERE id=:p"), {"p": prod["id"]})
        db.execute(text("DELETE FROM servicios WHERE id=:s"), {"s": serv["id"]})
        db.execute(text("DELETE FROM citas WHERE paciente_id=:p"), {"p": pac["id"]})
        db.execute(text("DELETE FROM historias_clinicas WHERE paciente_id=:p"), {"p": pac["id"]})
        db.execute(text("DELETE FROM pacientes WHERE id=:p"), {"p": pac["id"]})
        db.execute(text("DELETE FROM clientes WHERE id=:cli"), {"cli": cli["id"]})
        db.commit()
        print("  datos de prueba eliminados")
    finally:
        db.close()

    print(f"\n=== RESULTADO: {ok} OK, {fail} FALLOS ===")
    c.close()
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
