import pytest
from sqlalchemy import text
from database import SessionLocal

def test_historia_clinica_campos_completos(client, admin, doctor):
    # 1. Crear cliente y paciente para la prueba
    cli = client.post(
        "/api/clientes/",
        json={"nombre": "Dueño Prueba Completa", "dni": "99999999"},
        headers=admin
    ).json()
    pac = client.post(
        f"/api/clientes/{cli['id']}/pacientes/",
        json={"nombre": "Mascota Completa", "especie": "Canino", "raza": "Labrador"},
        headers=admin
    ).json()

    try:
        # 2. Definir un payload con absolutamente todos los campos clínicos y de tesis rellenos
        payload = {
            "motivo_consulta": "Consulta preventiva y chequeo general anual",
            "tiempo_evolucion": "2 semanas",
            "derivado_por": "Dr. Juan Pérez",
            "detalle": "Mascota presenta ligera descamación cutánea pero apetito y ánimo normales.",
            "alimentacion_tipo": "Super Premium Seco",
            "alimentacion_cantidad_gr": 350,
            "antecedentes": "Vacunación anual completa en 2025. Alergia menor a picaduras de pulga.",
            "tipo_consulta": "control",
            
            "temperatura_c": 38.7,
            "peso_kg": 28.50,
            "frecuencia_cardiaca": 95,
            "frecuencia_respiratoria": 24,
            "condicion_corporal": 5,
            "mucosas": "rosadas",
            "tllc": "normal",
            "estado_sensorio": "alerta",
            "hidratacion": "normal",
            "pulso": "fuerte",
            "linfonodulos": "Linfonódulos submandibulares y poplíteos normales, no reactivos.",
            
            "examen_particular": {
                "tegumentario": {"estado": "alterado", "detalle": "Ligera seborrea seca en región lumbosacra."},
                "cardiovascular": {"estado": "normal", "detalle": "Sin soplos ni arritmias audibles."},
                "respiratorio": {"estado": "normal", "detalle": "Campos pulmonares limpios."},
                "digestivo": {"estado": "normal", "detalle": "Abdomen blando y depresible."},
                "urinario": {"estado": "normal", "detalle": "Vejiga normal a la palpación."},
                "reproductor": {"estado": "normal", "detalle": "Testículos descendidos y normales."},
                "nervioso": {"estado": "normal", "detalle": "Reflejos espinales presentes y normales."},
                "musculoesqueletico": {"estado": "normal", "detalle": "Sin claudicaciones."},
                "linfatico": {"estado": "normal", "detalle": "Sin anomalías."},
                "sentidos": {"estado": "normal", "detalle": "Conductos auditivos limpios."},
                "endocrino": {"estado": "no_evaluado", "detalle": None}
            },
            
            "diagnostico_presuntivo": "Dermatitis seborreica leve",
            "diagnosticos_diferenciales": "Dermatitis alérgica por pulgas, piodermia superficial",
            "diagnostico_definitivo": "Seborrea seca primaria leve",
            
            "examenes_solicitados": "Raspado de piel y citología cutánea",
            "tratamiento_items": [
                {
                    "medicamento": "Champú Antiseborreico",
                    "dosis": "1 baño cada 3 días",
                    "via": "Tópica",
                    "frecuencia": "c/72h",
                    "duracion": "3 semanas"
                },
                {
                    "medicamento": "Omega 3 y 6",
                    "dosis": "1 cápsula diaria",
                    "via": "Oral",
                    "frecuencia": "c/24h",
                    "duracion": "30 días"
                }
            ],
            "vacunas_items": [
                {
                    "vacuna": "Séxtuple Canina",
                    "lote": "LOTE-SX-9988",
                    "proxima_dosis": "En 1 año"
                }
            ],
            "indicaciones": "Bañar dejando actuar el champú por 10 minutos antes de enjuagar. Suplementar alimento.",
            "pronostico": "favorable",
            "proxima_cita": "2026-07-26T09:00:00Z",
            
            "transcripcion": "Dictado de voz del doctor detallando constantes y tratamiento...",
            "datos_ia": {"analisis_gpt": "campos procesados correctamente"},
            
            "segundos_registro": 120,
            "metodo_registro": "ia"
        }

        # 3. Crear historia clínica (POST)
        res_post = client.post(
            f"/api/pacientes/{pac['id']}/historias/",
            json=payload,
            headers=doctor
        )
        assert res_post.status_code == 201, f"Error en POST: {res_post.text}"
        h_data = res_post.json()
        assert h_data["id"] is not None

        # 4. Recuperar la historia clínica (GET) y verificar que todos los campos coincidan
        res_get = client.get(
            f"/api/pacientes/{pac['id']}/historias/{h_data['id']}",
            headers=doctor
        )
        assert res_get.status_code == 200
        got = res_get.json()

        # Validaciones de anamnesis
        assert got["motivo_consulta"] == payload["motivo_consulta"]
        assert got["tiempo_evolucion"] == payload["tiempo_evolucion"]
        assert got["derivado_por"] == payload["derivado_por"]
        assert got["detalle"] == payload["detalle"]
        assert got["alimentacion_tipo"] == payload["alimentacion_tipo"]
        assert got["alimentacion_cantidad_gr"] == payload["alimentacion_cantidad_gr"]
        assert got["antecedentes"] == payload["antecedentes"]
        assert got["tipo_consulta"] == payload["tipo_consulta"]

        # Validaciones de EOG (constantes)
        assert float(got["temperatura_c"]) == payload["temperatura_c"]
        assert float(got["peso_kg"]) == payload["peso_kg"]
        assert got["frecuencia_cardiaca"] == payload["frecuencia_cardiaca"]
        assert got["frecuencia_respiratoria"] == payload["frecuencia_respiratoria"]
        assert got["condicion_corporal"] == payload["condicion_corporal"]
        assert got["mucosas"] == payload["mucosas"]
        assert got["tllc"] == payload["tllc"]
        assert got["estado_sensorio"] == payload["estado_sensorio"]
        assert got["hidratacion"] == payload["hidratacion"]
        assert got["pulso"] == payload["pulso"]
        assert got["linfonodulos"] == payload["linfonodulos"]

        # Validaciones de EOP (sistemas)
        assert got["examen_particular"] == payload["examen_particular"]

        # Validaciones de diagnósticos
        assert got["diagnostico_presuntivo"] == payload["diagnostico_presuntivo"]
        assert got["diagnosticos_diferenciales"] == payload["diagnosticos_diferenciales"]
        assert got["diagnostico_definitivo"] == payload["diagnostico_definitivo"]

        # Validaciones de plan
        assert got["examenes_solicitados"] == payload["examenes_solicitados"]
        assert got["tratamiento_items"] == payload["tratamiento_items"]
        assert got["vacunas_items"] == payload["vacunas_items"]
        assert got["indicaciones"] == payload["indicaciones"]
        assert got["pronostico"] == payload["pronostico"]
        # Validar próxima cita (ignorando offset de zona horaria si el formato difiere mínimamente)
        assert "2026-07-26" in got["proxima_cita"]

        # Validaciones de IA y auditoría
        assert got["transcripcion"] == payload["transcripcion"]
        assert got["datos_ia"] == payload["datos_ia"]
        assert got["segundos_registro"] == payload["segundos_registro"]
        assert got["metodo_registro"] == payload["metodo_registro"]
        assert got["veterinario_id"] is not None
        assert got["veterinario_nombre"] == "QA Doctor"

        # 5. Modificar la historia clínica (PUT)
        new_payload = dict(payload)
        new_payload["motivo_consulta"] = "Chequeo modificado"
        new_payload["peso_kg"] = 29.1
        new_payload["tipo_consulta"] = "control"
        new_payload["examen_particular"]["tegumentario"]["estado"] = "normal"
        new_payload["examen_particular"]["tegumentario"]["detalle"] = "Piel sana tras tratamiento"
        new_payload["tratamiento_items"] = []
        new_payload["vacunas_items"] = []

        res_put = client.put(
            f"/api/pacientes/{pac['id']}/historias/{h_data['id']}",
            json=new_payload,
            headers=doctor
        )
        assert res_put.status_code == 200, f"Error en PUT: {res_put.text}"
        put_data = res_put.json()
        assert put_data["motivo_consulta"] == "Chequeo modificado"
        assert float(put_data["peso_kg"]) == 29.1
        assert put_data["examen_particular"]["tegumentario"]["estado"] == "normal"
        assert put_data["tratamiento_items"] is None or len(put_data["tratamiento_items"]) == 0
        assert put_data["vacunas_items"] is None or len(put_data["vacunas_items"]) == 0

        # 6. Eliminar la historia clínica (DELETE)
        res_del = client.delete(
            f"/api/pacientes/{pac['id']}/historias/{h_data['id']}",
            headers=doctor
        )
        assert res_del.status_code == 204

    finally:
        # Limpieza de base de datos
        client.delete(f"/api/pacientes/{pac['id']}", headers=admin)
        db = SessionLocal()
        db.execute(text("DELETE FROM clientes WHERE id=:c"), {"c": cli["id"]})
        db.commit()
        db.close()
