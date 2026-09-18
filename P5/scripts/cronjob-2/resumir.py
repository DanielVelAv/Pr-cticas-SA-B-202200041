"""Cronjob 2 — resumen de ejecuciones.

Se ejecuta cada 10 minutos, consulta los registros que dejo el Cronjob 1,
calcula cuantas ejecuciones hubo por hora y publica ese resumen como un
mensaje en el broker.

Cierra el encadenamiento del flujo:
    cronjob-1 -> base de datos -> cronjob-2 -> broker -> worker -> base de datos
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pika
import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]
RABBITMQ_URL = os.environ["RABBITMQ_URL"]
COLA_RESUMEN = os.environ.get("COLA_RESUMEN_CRON", "cron.resumen")
CARNE = os.environ.get("CARNE_ESTUDIANTE", "sin-carne")
ZONA = ZoneInfo(os.environ.get("TZ", "America/Guatemala"))

# Un Job puede arrancar antes de que CoreDNS resuelva o antes de que la
# base y el broker acepten conexiones. Sin espera, el Job muere de
# inmediato y consume su backoffLimit en segundos.
ESPERA_INTENTOS = int(os.environ.get("ESPERA_INTENTOS", "30"))
ESPERA_SEGUNDOS = float(os.environ.get("ESPERA_SEGUNDOS", "3"))


def reintentar(descripcion: str, accion):
    """Ejecuta `accion` reintentando mientras la dependencia no responda."""
    ultimo = None
    for intento in range(1, ESPERA_INTENTOS + 1):
        try:
            return accion()
        except Exception as exc:  # noqa: BLE001
            ultimo = exc
            print(
                f"[cronjob-2] esperando {descripcion} ({intento}/{ESPERA_INTENTOS}): {exc}",
                flush=True,
            )
            time.sleep(ESPERA_SEGUNDOS)
    raise RuntimeError(f"no se pudo conectar a {descripcion}: {ultimo}")


def calcular_resumen() -> dict:
    """Agrupa las ejecuciones por hora local."""
    con = reintentar(
        "la base de datos",
        lambda: psycopg.connect(DATABASE_URL, row_factory=dict_row),
    )
    with con:
        # Si el Cronjob 1 aun no ha corrido, la tabla no existe.
        # Se crea vacia para que este job no falle por eso.
        con.execute(
            """CREATE TABLE IF NOT EXISTS ejecuciones_cron (
                   id                SERIAL PRIMARY KEY,
                   ejecutado_en      TIMESTAMPTZ NOT NULL,
                   ejecutado_en_gmt6 VARCHAR(30)  NOT NULL,
                   carne             VARCHAR(20)  NOT NULL
               )"""
        )
        con.commit()
        filas = con.execute(
            "SELECT ejecutado_en FROM ejecuciones_cron ORDER BY ejecutado_en"
        ).fetchall()

    # Contador de ejecuciones por hora, en hora local GMT-6
    por_hora = Counter(
        f["ejecutado_en"].astimezone(ZONA).strftime("%Y-%m-%d %H:00") for f in filas
    )

    ahora = datetime.now(timezone.utc).astimezone(ZONA)
    return {
        "evento_id": str(uuid.uuid4()),
        "tipo": "ResumenEjecuciones",
        "generado_en": ahora.strftime("%Y-%m-%d %H:%M:%S GMT-6"),
        "carne": CARNE,
        "total_ejecuciones": len(filas),
        "por_hora": dict(sorted(por_hora.items())),
    }


def publicar(resumen: dict) -> None:
    parametros = pika.URLParameters(RABBITMQ_URL)
    parametros.socket_timeout = 10
    conexion = reintentar("el broker", lambda: pika.BlockingConnection(parametros))
    try:
        canal = conexion.channel()
        # Debe declararse igual que en el consumidor: si una parte la
        # declara durable y la otra no, RabbitMQ rechaza la operacion.
        canal.queue_declare(queue=COLA_RESUMEN, durable=True)
        canal.confirm_delivery()
        canal.basic_publish(
            exchange="",
            routing_key=COLA_RESUMEN,
            body=json.dumps(resumen).encode("utf-8"),
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=2,  # persistente en disco
                message_id=resumen["evento_id"],
            ),
        )
    finally:
        if conexion.is_open:
            conexion.close()


def main() -> int:
    resumen = calcular_resumen()
    publicar(resumen)
    print(
        f"[cronjob-2] resumen publicado: {resumen['total_ejecuciones']} ejecuciones "
        f"en {len(resumen['por_hora'])} hora(s) | carne {resumen['carne']}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"[cronjob-2] fallo: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
