"""Cronjob 1 — registro de ejecuciones.

Se ejecuta cada 2 minutos e inserta un registro con la fecha y hora de
ejecucion en zona GMT-6 y el numero de carne del estudiante.

Es un Job: hace su trabajo, cierra y termina con codigo 0. No es un
servicio que quede escuchando.
"""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]
CARNE = os.environ.get("CARNE_ESTUDIANTE", "sin-carne")

# America/Guatemala es GMT-6 todo el año: el pais no aplica horario de
# verano, asi que el desfase nunca cambia.
ZONA = ZoneInfo(os.environ.get("TZ", "America/Guatemala"))

# Un Job puede arrancar antes de que CoreDNS resuelva o antes de que
# Postgres acepte conexiones. Sin espera, el Job muere de inmediato y
# consume su backoffLimit en segundos.
ESPERA_INTENTOS = int(os.environ.get("ESPERA_DB_INTENTOS", "30"))
ESPERA_SEGUNDOS = float(os.environ.get("ESPERA_DB_SEGUNDOS", "3"))

ESQUEMA = """
CREATE TABLE IF NOT EXISTS ejecuciones_cron (
    id                SERIAL PRIMARY KEY,
    -- Momento absoluto, para ordenar y agrupar sin ambiguedad
    ejecutado_en      TIMESTAMPTZ NOT NULL,
    -- La misma marca, ya formateada en GMT-6, como pide el enunciado
    ejecutado_en_gmt6 VARCHAR(30)  NOT NULL,
    carne             VARCHAR(20)  NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ejecuciones_fecha ON ejecuciones_cron (ejecutado_en);
"""


def conectar_con_espera() -> psycopg.Connection:
    """Abre la conexion reintentando mientras la base no este disponible.

    Cubre los dos fallos reales de arranque en Kubernetes: que CoreDNS
    todavia no resuelva el nombre del servicio ("Temporary failure in
    name resolution") y que Postgres este arriba pero aun no acepte
    conexiones.
    """
    ultimo = None
    for intento in range(1, ESPERA_INTENTOS + 1):
        try:
            return psycopg.connect(DATABASE_URL, row_factory=dict_row)
        except Exception as exc:  # noqa: BLE001
            ultimo = exc
            print(
                f"[cronjob-1] esperando base de datos ({intento}/{ESPERA_INTENTOS}): {exc}",
                flush=True,
            )
            time.sleep(ESPERA_SEGUNDOS)
    raise RuntimeError(f"no se pudo conectar a la base de datos: {ultimo}")


def main() -> int:
    ahora_utc = datetime.now(timezone.utc)
    ahora_local = ahora_utc.astimezone(ZONA)
    marca = ahora_local.strftime("%Y-%m-%d %H:%M:%S GMT-6")

    with conectar_con_espera() as con:
        con.execute(ESQUEMA)
        fila = con.execute(
            """INSERT INTO ejecuciones_cron (ejecutado_en, ejecutado_en_gmt6, carne)
               VALUES (%s, %s, %s) RETURNING id""",
            (ahora_utc, marca, CARNE),
        ).fetchone()
        con.commit()

    print(f"[cronjob-1] registro #{fila['id']} -> {marca} | carne {CARNE}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        # Terminar con codigo distinto de 0 hace que Kubernetes marque el
        # Job como fallido y aplique el backoffLimit.
        print(f"[cronjob-1] fallo: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
