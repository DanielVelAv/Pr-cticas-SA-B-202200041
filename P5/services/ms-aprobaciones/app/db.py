"""Acceso a datos del microservicio de aprobaciones.

Base de datos propia e independiente: aprobaciones_db.
"""
from __future__ import annotations

import os
import time

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]

ESQUEMA = """
CREATE TABLE IF NOT EXISTS solicitudes (
    id            SERIAL PRIMARY KEY,
    -- referencia externa a ms-lotes: NO es llave foranea porque
    -- ese dato vive en otra base de datos, de otro microservicio.
    lote_id       INT          NOT NULL,
    monto_total   NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado        VARCHAR(20)  NOT NULL DEFAULT 'EN_CURSO'
                  CHECK (estado IN ('EN_CURSO','APROBADA','RECHAZADA')),
    paso_actual   INT          NOT NULL DEFAULT 1,
    creado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pasos (
    id            SERIAL PRIMARY KEY,
    solicitud_id  INT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
    numero_paso   INT NOT NULL CHECK (numero_paso BETWEEN 1 AND 3),
    rol_requerido VARCHAR(20) NOT NULL,
    usuario_id    VARCHAR(50) NOT NULL,
    decision      VARCHAR(20) NOT NULL CHECK (decision IN ('APROBADO','RECHAZADO')),
    comentario    VARCHAR(300),
    decidido_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (solicitud_id, numero_paso)
);
"""

ROL_POR_PASO = {1: "maker", 2: "checker", 3: "authorizer"}


def conectar() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def inicializar() -> None:
    for intento in range(1, 16):
        try:
            with conectar() as con:
                con.execute(ESQUEMA)
                con.commit()
            print("[ms-aprobaciones] esquema aplicado", flush=True)
            return
        except Exception as exc:  # noqa: BLE001
            print(f"[ms-aprobaciones] esperando base de datos ({intento}/15): {exc}", flush=True)
            time.sleep(2)
    raise RuntimeError("No se pudo conectar a la base de datos")
