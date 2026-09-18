"""Publicacion de eventos hacia el broker de mensajeria.

Este modulo es el PRODUCTOR del flujo asincrono. Publica el evento y
retorna de inmediato: quien aprueba un lote no espera a que se envien
las notificaciones.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

import pika

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
COLA_LOTES_APROBADOS = os.environ.get("COLA_LOTES_APROBADOS", "lotes.aprobados")


class ErrorPublicacion(Exception):
    """No se pudo entregar el evento al broker."""


def _abrir_canal() -> tuple[pika.BlockingConnection, pika.adapters.blocking_connection.BlockingChannel]:
    parametros = pika.URLParameters(RABBITMQ_URL)
    # Si el broker no responde rapido preferimos fallar y registrarlo,
    # no dejar colgada la peticion HTTP del usuario.
    parametros.socket_timeout = 5
    parametros.blocked_connection_timeout = 5
    conexion = pika.BlockingConnection(parametros)
    canal = conexion.channel()

    # durable=True hace que la definicion de la cola sobreviva al
    # reinicio del broker. Sin esto la cola desaparece y los mensajes
    # pendientes se pierden.
    canal.queue_declare(queue=COLA_LOTES_APROBADOS, durable=True)

    # Confirmaciones del publicador: basic_publish deja de ser "disparar
    # y olvidar" y el broker acusa recibo de cada mensaje.
    canal.confirm_delivery()
    return conexion, canal


def publicar_lote_aprobado(solicitud: dict) -> str:
    """Publica el evento LoteAprobado y devuelve su identificador.

    El evento es AUTOCONTENIDO: lleva todo lo que el consumidor necesita.
    No se limita a mandar el id esperando que el consumidor consulte a
    ms-lotes, porque las NetworkPolicies impiden esa llamada: solo el
    API Gateway puede alcanzar a los microservicios.
    """
    evento_id = str(uuid.uuid4())
    evento = {
        "evento_id": evento_id,
        "tipo": "LoteAprobado",
        "ocurrido_en": datetime.now(timezone.utc).isoformat(),
        "lote_id": solicitud["lote_id"],
        "solicitud_id": solicitud["id"],
        "monto_total": float(solicitud["monto_total"]),
    }

    conexion = None
    try:
        conexion, canal = _abrir_canal()
        canal.basic_publish(
            exchange="",
            routing_key=COLA_LOTES_APROBADOS,
            body=json.dumps(evento).encode("utf-8"),
            properties=pika.BasicProperties(
                content_type="application/json",
                # delivery_mode=2 escribe el mensaje en disco: sobrevive
                # al reinicio del broker. Una cola durable con mensajes
                # no persistentes seguiria perdiendo el contenido.
                delivery_mode=2,
                message_id=evento_id,
            ),
        )
        return evento_id
    except Exception as exc:  # noqa: BLE001
        raise ErrorPublicacion(f"No se pudo publicar el evento: {exc}") from exc
    finally:
        if conexion is not None and conexion.is_open:
            conexion.close()
