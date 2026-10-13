"""Glosario del dictado: permisos, duplicados y que llegue al vocabulario."""
import uuid

from database import SessionLocal
from services import vocabulario


def test_glosario_crud_y_permisos(client, admin, doctor):
    nombre = f"Zeta{uuid.uuid4().hex[:6]}"
    # El glosario es de la administradora: el veterinario no lo lee ni lo edita
    assert client.get("/api/glosario/", headers=doctor).status_code == 403
    assert client.post("/api/glosario/", json={"termino": nombre}, headers=doctor).status_code == 403

    r = client.post("/api/glosario/", headers=admin,
                    json={"termino": nombre, "suena_como": " zeta vet ,  seta vet", "tipo": "medicamento"})
    assert r.status_code == 201, r.text
    t = r.json()
    try:
        assert t["suena_como"] == "zeta vet, seta vet"
        # duplicado (sin importar mayúsculas)
        dup = client.post("/api/glosario/", json={"termino": nombre.lower()}, headers=admin)
        assert dup.status_code == 409

        # entra al vocabulario de refuerzo y a las variantes
        db = SessionLocal()
        try:
            assert nombre in vocabulario.keyterms(db)
            assert ("zeta vet", nombre) in vocabulario.variantes_glosario(db)
        finally:
            db.close()

        # desactivarlo lo saca
        client.put(f"/api/glosario/{t['id']}", headers=admin,
                   json={"termino": nombre, "activo": False})
        db = SessionLocal()
        try:
            assert nombre not in vocabulario.keyterms(db)
        finally:
            db.close()
    finally:
        assert client.delete(f"/api/glosario/{t['id']}", headers=admin).status_code == 204
