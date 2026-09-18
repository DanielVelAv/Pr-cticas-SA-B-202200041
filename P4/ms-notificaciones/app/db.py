"""Acceso a datos del microservicio de notificaciones."""
from __future__ import annotations

import os
import time

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]

ESQUEMA = """
CREATE TABLE IF NOT EXISTS notificaciones (
    id                 SERIAL PRIMARY KEY,
    lote_id            INT          NOT NULL,
    destinatario_email VARCHAR(150) NOT NULL,
    asunto             VARCHAR(200) NOT NULL,
    cuerpo             TEXT         NOT NULL,
    estado             VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE'
                       CHECK (estado IN ('PENDIENTE','ENVIADA','FALLIDA')),
    intentos           INT          NOT NULL DEFAULT 0,
    creada_en          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plantillas (
    codigo  VARCHAR(50) PRIMARY KEY,
    asunto  VARCHAR(200) NOT NULL,
    cuerpo  TEXT NOT NULL
);

INSERT INTO plantillas (codigo, asunto, cuerpo)
VALUES ('LOTE_APROBADO',
        'Su transaccion esta en proceso',
        'Estimado {nombre}: su transaccion del lote {lote} por {monto} esta en proceso.')
ON CONFLICT (codigo) DO NOTHING;
"""


def conectar() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def inicializar() -> None:
    for intento in range(1, 16):
        try:
            with conectar() as con:
                con.execute(ESQUEMA)
                con.commit()
            print("[ms-notificaciones] esquema aplicado", flush=True)
            return
        except Exception as exc:  # noqa: BLE001
            print(f"[ms-notificaciones] esperando base de datos ({intento}/15): {exc}", flush=True)
            time.sleep(2)
    raise RuntimeError("No se pudo conectar a la base de datos")
