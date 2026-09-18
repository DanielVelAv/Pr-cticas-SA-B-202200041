"""Reglas de negocio del flujo maker-checker-authorizer.

Es la version implementada del flujo de 3 pasos disenado en la Practica 3.
"""
from __future__ import annotations

from app.db import ROL_POR_PASO, conectar


class ErrorNegocio(Exception):
    """Falla de regla de negocio. La capa HTTP la traduce a 409."""


def listar_solicitudes() -> list[dict]:
    with conectar() as con:
        return con.execute("SELECT * FROM solicitudes ORDER BY id DESC").fetchall()


def obtener_solicitud(solicitud_id: int) -> dict | None:
    with conectar() as con:
        return con.execute(
            "SELECT * FROM solicitudes WHERE id = %s", (solicitud_id,)
        ).fetchone()


def pasos_de(solicitud_id: int) -> list[dict]:
    with conectar() as con:
        return con.execute(
            "SELECT * FROM pasos WHERE solicitud_id = %s ORDER BY numero_paso",
            (solicitud_id,),
        ).fetchall()


def crear_solicitud(lote_id: int, monto_total: float) -> dict:
    with conectar() as con:
        fila = con.execute(
            "INSERT INTO solicitudes (lote_id, monto_total) VALUES (%s, %s) RETURNING *",
            (lote_id, monto_total),
        ).fetchone()
        con.commit()
        return fila


def registrar_paso(
    solicitud_id: int, usuario_id: str, decision: str, comentario: str | None = None
) -> dict:
    """Avanza un paso del flujo aplicando las dos reglas del negocio."""
    if decision not in ("APROBADO", "RECHAZADO"):
        raise ErrorNegocio("La decision debe ser APROBADO o RECHAZADO")

    with conectar() as con:
        solicitud = con.execute(
            "SELECT * FROM solicitudes WHERE id = %s", (solicitud_id,)
        ).fetchone()
        if solicitud is None:
            raise ErrorNegocio("La solicitud no existe")
        if solicitud["estado"] != "EN_CURSO":
            raise ErrorNegocio(f"La solicitud ya esta {solicitud['estado']}")

        paso = solicitud["paso_actual"]

        # Regla 1 — segregacion de funciones: ninguna persona puede
        # participar en dos pasos de la misma solicitud.
        previos = con.execute(
            "SELECT usuario_id FROM pasos WHERE solicitud_id = %s", (solicitud_id,)
        ).fetchall()
        if any(p["usuario_id"] == usuario_id for p in previos):
            raise ErrorNegocio(
                "Segregacion de funciones: este usuario ya participo en un paso anterior"
            )

        con.execute(
            """INSERT INTO pasos
                 (solicitud_id, numero_paso, rol_requerido, usuario_id, decision, comentario)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (solicitud_id, paso, ROL_POR_PASO[paso], usuario_id, decision, comentario),
        )

        # Regla 2 — un rechazo en cualquier paso cierra la solicitud.
        if decision == "RECHAZADO":
            nuevo_estado, nuevo_paso = "RECHAZADA", paso
        elif paso == 3:
            nuevo_estado, nuevo_paso = "APROBADA", 3
        else:
            nuevo_estado, nuevo_paso = "EN_CURSO", paso + 1

        fila = con.execute(
            "UPDATE solicitudes SET estado = %s, paso_actual = %s WHERE id = %s RETURNING *",
            (nuevo_estado, nuevo_paso, solicitud_id),
        ).fetchone()
        con.commit()
        return fila
