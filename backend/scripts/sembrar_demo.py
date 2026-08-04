"""Siembra una clínica ficticia completa, para demos y para pruebas.

Por qué existe
──────────────
Hasta ahora la única base era la de producción, con los clientes reales de
Veterinaria Los Pinos. Eso trae dos problemas concretos:

1. Grabar un video de venta contra esa base mostraría nombres, DNIs y
   teléfonos de personas reales. No se puede publicar.
2. La suite de pruebas escribe ahí, y varias veces dejó inventario y ventas
   inventadas en el sistema de la clínica.

Esta base resuelve las dos cosas. Los datos son evidentemente ficticios pero
se ven verosímiles en pantalla: la idea es que un video de demostración
muestre una clínica con movimiento —turnos del día, ventas de la semana,
historias con tratamientos— y no formularios vacíos.

Uso
───
    cd backend
    # crear/rellenar la base de demo (borra lo que hubiera antes)
    .venv/Scripts/python.exe scripts/sembrar_demo.py --url "postgresql+psycopg://.../vet_demo"

    # o tomando DEMO_DATABASE_URL del entorno
    .venv/Scripts/python.exe scripts/sembrar_demo.py

Después, para levantar el backend contra la demo:
    set DATABASE_URL=<url de la demo>   (Windows: $env:DATABASE_URL=...)
    .venv/Scripts/python.exe -m uvicorn main:app --port 8000

Cuentas que deja creadas:  demo_admin / demo1234   (recepción)
                           demo_vet   / demo1234   (veterinario)
"""
import argparse
import os
import random
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

# Semilla fija: la misma corrida produce los mismos datos, así un video que se
# regraba no cambia de nombres ni de importes entre tomas.
random.seed(20260801)

NOMBRES = [
    "Lucía Ramírez", "Andrés Castillo", "Valeria Ponce", "Diego Salazar",
    "Camila Vargas", "Joaquín Medina", "Renata Ocampo", "Bruno Herrera",
    "Sofía Delgado", "Martín Quiroga", "Elena Ríos", "Tomás Bustamante",
    "Paula Miranda", "Ignacio Fuentes", "Daniela Cordero", "Emilio Paredes",
    "Antonia Vega", "Rodrigo Almeyda", "Isabel Nieto", "Facundo Rivas",
]

MASCOTAS_PERRO = [
    ("Nube", "Shih Tzu"), ("Rocco", "Bulldog Francés"), ("Kira", "Schnauzer"),
    ("Simón", "Beagle"), ("Maple", "Golden Retriever"), ("Tobi", "Mestizo"),
    ("Olivia", "French Poodle"), ("Bruno", "Labrador Retriever"),
    ("Frida", "Chihuahua"), ("Copito", "Bichón Maltés"),
    ("Zeus", "Pastor Alemán"), ("Lola", "Cocker Spaniel Inglés"),
]
MASCOTAS_GATO = [
    ("Miso", "Común europeo"), ("Pelusa", "Persa"), ("Ítalo", "Siamés"),
    ("Nala", "Común europeo"),
]

PRODUCTOS = [
    # (nombre, categoría, precio, stock, mínimo, vence_en_días)
    ("MELOXIVET 4MG x 10 TAB",        "medicamento", 28.00, 24, 5,  400),
    ("HEPATINE frasco 30 ml",         "medicamento", 45.00, 12, 3,  180),
    ("HISTAPROV jarabe 60 ml",        "medicamento", 38.50,  9, 3,   25),  # por vencer
    ("Amoxicilina 500 mg x 20 TAB",   "medicamento", 32.00, 18, 5,  520),
    ("Metronidazol 250 mg x 30 TAB",  "medicamento", 26.00,  4, 6,  300),  # stock bajo
    ("Bravecto 10-20 kg",             "medicamento", 165.00, 8, 2,  600),
    ("Nobivac Puppy DP",              "medicamento", 55.00, 15, 4,   90),
    ("Alimento Premium Adulto 3 kg",  "comida",      118.00, 11, 3, None),
    ("Alimento Gatitos 1.5 kg",       "comida",       72.00,  7, 3, None),
    ("Collar antipulgas mediano",     "accesorio",    39.00, 20, 5, None),
    ("Correa retráctil 5 m",          "accesorio",    54.00,  6, 3, None),
    ("Shampoo medicado 250 ml",       "accesorio",    31.00, 14, 4, None),
]

SERVICIOS = [
    ("Consulta general", "Evaluación clínica completa", 60.00, False),
    ("Consulta de urgencia", "Atención fuera de horario", 110.00, False),
    ("Vacunación", "Aplicación de vacuna (no incluye el biológico)", 35.00, False),
    ("Desparasitación", "Antiparasitario interno o externo", 40.00, False),
    ("Baño y corte", "Estética según tamaño", 55.00, False),
    ("Cirugía", "Monto según procedimiento", None, True),
    ("Radiografía", "Una placa", 90.00, False),
]

MOTIVOS = [
    "Vómitos desde hace dos días", "Control post-operatorio", "Vacunación anual",
    "Cojera de la pata trasera", "Chequeo general", "Picazón y caída de pelo",
    "No quiere comer", "Control de peso",
]


def _tel():
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(8))


def _dni():
    return str(random.randint(10_000_000, 79_999_999))


def sembrar(url: str) -> None:
    # La URL se fija ANTES de importar los módulos que crean el engine: si no,
    # se conectarían a la base del .env, que es producción.
    os.environ["DATABASE_URL"] = url

    from alembic import command
    from alembic.config import Config

    raiz = Path(__file__).resolve().parents[1]
    cfg = Config(str(raiz / "alembic.ini"))
    cfg.set_main_option("script_location", str(raiz / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    print("[demo] Aplicando migraciones…")
    command.upgrade(cfg, "head")

    from sqlalchemy import text
    from core.security import hash_password
    from database import SessionLocal
    from models import (
        Cita, Cliente, ConfiguracionClinica, HistoriaClinica, MovimientoInventario,
        Paciente, Producto, Receta, Servicio, Usuario, Venta, VentaItem,
    )

    db = SessionLocal()
    try:
        print("[demo] Vaciando la base de demo…")
        # Orden por dependencias. Se usa TRUNCATE ... CASCADE para no pelear
        # con el orden exacto de las claves foráneas.
        db.execute(text(
            "TRUNCATE venta_items, ventas, movimientos_inventario, productos, "
            "servicios, recetas, historias_clinicas, citas, asistencias, "
            "documentos_paciente, registros_clinicos, pacientes, clientes, "
            "usuarios, configuracion_clinica, cierres_caja, actividades, "
            "errores, vacunas_avisadas RESTART IDENTITY CASCADE"
        ))
        db.commit()

        # ── Clínica ─────────────────────────────────────────────────────────
        db.add(ConfiguracionClinica(
            id=1,
            nombre="Veterinaria Demo",
            ruc="20512345678",
            direccion="Av. Siempre Viva 742, Lima",
            telefono="(01) 555-0142",
            email="contacto@veterinariademo.pe",
            pie_comprobante="Gracias por confiar en nosotros",
        ))

        # ── Personal ────────────────────────────────────────────────────────
        recepcion = Usuario(usuario="demo_admin", nombre="Carla Espinoza",
                            password_hash=hash_password("demo1234"),
                            rol="recepcionista", activo=True,
                            dni=_dni(), telefono=_tel())
        vets = [
            Usuario(usuario="demo_vet", nombre="Dra. Paula Arrieta",
                    password_hash=hash_password("demo1234"), rol="veterinario",
                    activo=True, dni=_dni(), telefono=_tel(),
                    especialidad="Medicina interna", hora_entrada="08:00",
                    dias_laborales="lun,mar,mie,jue,vie"),
            Usuario(usuario="demo_vet2", nombre="Dr. Hugo Belmonte",
                    password_hash=hash_password("demo1234"), rol="veterinario",
                    activo=True, dni=_dni(), telefono=_tel(),
                    especialidad="Cirugía", hora_entrada="10:00",
                    dias_laborales="lun,mie,vie,sab"),
        ]
        db.add(recepcion)
        for v in vets:
            db.add(v)
        db.flush()

        # ── Catálogo ────────────────────────────────────────────────────────
        hoy = date.today()
        prefijos = {"comida": "COM", "accesorio": "ACC", "medicamento": "MED"}
        contador = {k: 0 for k in prefijos}
        productos = []
        for nombre, cat, precio, stock, minimo, vence in PRODUCTOS:
            contador[cat] += 1
            p = Producto(
                codigo=f"{prefijos[cat]}-{contador[cat]:04d}",
                nombre=nombre, categoria=cat, precio=precio, stock=stock,
                stock_minimo=minimo, activo=True,
                proveedor=random.choice(["MedVet S.A.", "Distribuidora Andina",
                                         "PetSupply Perú"]),
                unidad=random.choice(["caja", "frasco", "unidad", "bolsa"]),
                fecha_vencimiento=(hoy + timedelta(days=vence)) if vence else None,
                lote=f"L-{random.randint(1000, 9999)}" if vence else None,
            )
            db.add(p)
            productos.append(p)

        servicios = []
        for nombre, desc, precio, variable in SERVICIOS:
            s = Servicio(nombre=nombre, descripcion=desc, precio=precio,
                         precio_variable=variable, activo=True)
            db.add(s)
            servicios.append(s)
        db.flush()

        for p in productos:
            db.add(MovimientoInventario(
                producto_id=p.id, tipo="entrada", cantidad=p.stock,
                stock_resultante=p.stock, motivo="Stock inicial",
            ))

        # ── Clientes y mascotas ─────────────────────────────────────────────
        # Se cicla la lista en vez de agotarla: con 20 dueños y 16 nombres de
        # mascota, agotarla dejaba a cuatro clientes sin ninguna. Que dos
        # dueños distintos tengan un perro llamado "Tobi" es de lo más normal.
        mascotas_pool = ([(n, r, "Canino") for n, r in MASCOTAS_PERRO] +
                         [(n, r, "Felino") for n, r in MASCOTAS_GATO])
        random.shuffle(mascotas_pool)
        siguiente_mascota = 0

        pacientes = []
        for i, nombre in enumerate(NOMBRES):
            c = Cliente(nombre=nombre, dni=_dni(), telefono=_tel(),
                        direccion=f"Calle {random.randint(1, 40)} N° {random.randint(100, 899)}, Lima")
            db.add(c)
            db.flush()
            for _ in range(1 if i % 3 else 2):     # cada tanto, dos mascotas
                nom, raza, especie = mascotas_pool[siguiente_mascota % len(mascotas_pool)]
                siguiente_mascota += 1
                p = Paciente(
                    cliente_id=c.id, nombre=nom, especie=especie, raza=raza,
                    sexo=random.choice(["macho", "hembra"]),
                    edad=random.randint(1, 12),
                    esterilizado=random.choice([True, False]),
                    color=random.choice(["Blanco", "Negro", "Marrón", "Atigrado", "Crema"]),
                    alergias=random.choice([None, None, None, "Pollo", "Polen"]),
                )
                db.add(p)
                pacientes.append(p)
        db.flush()

        # ── Historias clínicas del último mes ───────────────────────────────
        for dias_atras in range(30, 0, -1):
            for _ in range(random.randint(0, 2)):
                pac = random.choice(pacientes)
                vet = random.choice(vets)
                cuando = datetime.combine(
                    hoy - timedelta(days=dias_atras),
                    time(random.randint(9, 18), random.choice([0, 15, 30, 45])),
                ).replace(tzinfo=timezone.utc)
                trat = []
                if random.random() < 0.7:
                    med = random.choice([p for p in productos if p.categoria == "medicamento"])
                    trat = [{
                        "medicamento": med.nombre,
                        "dosis": random.choice(["1 tableta", "0.5 ml/kg", "1/4 tableta"]),
                        "via": random.choice(["Oral", "Subcutánea"]),
                        "frecuencia": random.choice(["cada 12 horas", "cada 24 horas"]),
                        "duracion": random.choice(["5 días", "7 días", "dosis única"]),
                    }]
                db.add(HistoriaClinica(
                    paciente_id=pac.id, veterinario_id=vet.id, fecha=cuando,
                    motivo_consulta=random.choice(MOTIVOS),
                    tipo_consulta=random.choice(["control", "primera_vez", "urgencia", "vacunacion"]),
                    peso_kg=round(random.uniform(2.5, 34.0), 1),
                    temperatura_c=round(random.uniform(37.8, 39.4), 1),
                    frecuencia_cardiaca=random.randint(70, 140),
                    frecuencia_respiratoria=random.randint(15, 34),
                    mucosas="rosadas", hidratacion="normal", estado_sensorio="alerta",
                    diagnostico_presuntivo=random.choice([
                        "Gastroenteritis leve", "Dermatitis alérgica",
                        "Control sano", "Otitis externa", "Sobrepeso",
                    ]),
                    tratamiento_items=trat,
                    indicaciones="Dieta blanda por tres días. Control si no mejora.",
                    pronostico="favorable",
                ))

        # ── Turnos: ayer, hoy y los próximos días ───────────────────────────
        for dia in range(-1, 6):
            for _ in range(random.randint(2, 5)):
                pac = random.choice(pacientes)
                cuando = datetime.combine(
                    hoy + timedelta(days=dia),
                    time(random.randint(9, 18), random.choice([0, 30])),
                ).replace(tzinfo=timezone.utc)
                estado = "atendida" if dia < 0 else random.choice(
                    ["pendiente", "pendiente", "confirmada"])
                db.add(Cita(
                    paciente_id=pac.id, fecha_hora=cuando,
                    veterinario_id=random.choice(vets).id,
                    motivo=random.choice(["Control", "Vacunación", "Consulta general",
                                          "Desparasitación", "Baño y corte"]),
                    estado=estado, creado_por="demo_admin",
                ))

        # ── Ventas de las últimas dos semanas ───────────────────────────────
        clientes = db.query(Cliente).all()
        for dias_atras in range(14, -1, -1):
            for _ in range(random.randint(1, 4)):
                cli = random.choice(clientes)
                cuando = datetime.combine(
                    hoy - timedelta(days=dias_atras),
                    time(random.randint(9, 19), random.choice([5, 20, 35, 50])),
                ).replace(tzinfo=timezone.utc)
                venta = Venta(cliente_id=cli.id, fecha=cuando, total=0,
                              descuento_pct=0,
                              metodo_pago=random.choice(
                                  ["efectivo", "efectivo", "tarjeta", "yape", "plin"]))
                db.add(venta)
                db.flush()

                total = 0.0
                for _ in range(random.randint(1, 3)):
                    if random.random() < 0.6:
                        prod = random.choice(productos)
                        cant = random.randint(1, 2)
                        db.add(VentaItem(venta_id=venta.id, producto_id=prod.id,
                                         descripcion=prod.nombre, cantidad=cant,
                                         precio_unitario=prod.precio))
                        total += float(prod.precio) * cant
                    else:
                        serv = random.choice([s for s in servicios if not s.precio_variable])
                        db.add(VentaItem(venta_id=venta.id, servicio_id=serv.id,
                                         descripcion=serv.nombre, cantidad=1,
                                         precio_unitario=serv.precio))
                        total += float(serv.precio)
                venta.total = round(total, 2)

        db.commit()

        # ── Resumen ─────────────────────────────────────────────────────────
        def n(tabla):
            return db.execute(text(f"SELECT count(*) FROM {tabla}")).scalar()

        print("\n[demo] Clínica ficticia lista:")
        for tabla, etiqueta in [
            ("clientes", "clientes"), ("pacientes", "mascotas"),
            ("historias_clinicas", "historias"), ("citas", "turnos"),
            ("productos", "productos"), ("servicios", "servicios"),
            ("ventas", "ventas"), ("usuarios", "usuarios"),
        ]:
            print(f"    {etiqueta:<12} {n(tabla)}")
        print("\n    Acceso:  demo_admin / demo1234   (recepción)")
        print("             demo_vet   / demo1234   (veterinario)")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", help="URL de la base de demo (o DEMO_DATABASE_URL)")
    args = ap.parse_args()

    url = args.url or os.environ.get("DEMO_DATABASE_URL")
    if not url:
        print("ERROR: falta la URL de la base de demo.\n"
              "       Pásala con --url o define DEMO_DATABASE_URL.\n"
              "       NUNCA apuntes esto a la base de producción: la vacía entera.")
        return 1

    # Salvaguarda: esta base se TRUNCA completa. Un descuido acá borraría la
    # clínica real, así que se exige que el nombre diga que es de demostración.
    nombre_base = url.rstrip("/").rsplit("/", 1)[-1].split("?")[0]
    if "demo" not in nombre_base.lower() and "test" not in nombre_base.lower():
        print(f"ERROR: la base se llama '{nombre_base}'.\n"
              "       Este script BORRA todo lo que haya. Por seguridad solo\n"
              "       acepta bases con 'demo' o 'test' en el nombre.")
        return 1

    sembrar(url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
