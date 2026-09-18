"""Worker consumidor del broker de mensajeria.

Corre como un Deployment aparte del API, con la misma imagen pero otro
comando. Separarlo permite escalarlo a 0 replicas para demostrar que los
mensajes se acumulan en la cola durable y se procesan al restaurarlo,
sin perdida de informacion.

Ejecucion:  python -m app.worker
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import sys
import time

import pika

from app.db import conectar, inicializar

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "info").upper(),
    format="%(asctime)s %(levelname)s [worker] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("worker")

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
COLA_LOTES = os.environ.get("COLA_LOTES_APROBADOS", "lotes.aprobados")
COLA_RESUMEN = os.environ.get("COLA_RESUMEN_CRON", "cron.resumen")

# Archivos que leen las probes del Deployment: el worker no expone HTTP,
# asi que la salud se comprueba con exec sobre estos archivos.
ARCHIVO_LISTO = pathlib.Path("/tmp/listo")
ARCHIVO_LATIDO = pathlib.Path("/tmp/latido")


class ErrorPermanente(Exception):
    """El mensaje esta mal formado. Reintentarlo daria el mismo error."""


def _tocar_latido() -> None:
    ARCHIVO_LATIDO.write_text(str(int(time.time())), encoding="utf-8")


# ---------------------------------------------------------------------
# Procesamiento de cada tipo de mensaje
# ---------------------------------------------------------------------

def procesar_lote_aprobado(evento: dict) -> None:
    """Registra la notificacion del lote aprobado.

    Es idempotente: si el evento ya fue procesado no vuelve a insertar.
    RabbitMQ entrega AL MENOS UNA VEZ, asi que recibir el mismo evento
    dos veces es un escenario real, no teorico.
    """
    evento_id = evento.get("evento_id")
    lote_id = evento.get("lote_id")
    if not evento_id or lote_id is None:
        raise ErrorPermanente("el evento no trae evento_id o lote_id")

    with conectar() as con:
        ya = con.execute(
            "SELECT 1 FROM eventos_procesados WHERE evento_id = %s", (evento_id,)
        ).fetchone()
        if ya:
            log.info("evento %s ya procesado, se omite", evento_id)
            return

        con.execute(
            """INSERT INTO notificaciones
                 (lote_id, destinatario_email, asunto, cuerpo, estado, intentos)
               VALUES (%s, %s, %s, %s, 'ENVIADA', 1)""",
            (
                lote_id,
                "beneficiarios@usac.edu.gt",
                "Su transaccion esta en proceso",
                f"El lote {lote_id} por {evento.get('monto_total', 0):.2f} fue aprobado "
                f"y esta en proceso.",
            ),
        )
        con.execute(
            "INSERT INTO eventos_procesados (evento_id, tipo) VALUES (%s, %s)",
            (evento_id, evento.get("tipo", "LoteAprobado")),
        )
        con.commit()
    log.info("notificacion registrada para el lote %s", lote_id)


def procesar_resumen_cron(mensaje: dict) -> None:
    """Almacena el resumen que publica el Cronjob 2."""
    generado_en = mensaje.get("generado_en")
    if not generado_en:
        raise ErrorPermanente("el resumen no trae generado_en")

    with conectar() as con:
        con.execute(
            """INSERT INTO resumenes_cron (generado_en, carne, total_ejecuciones, detalle)
               VALUES (%s, %s, %s, %s)""",
            (
                generado_en,
                mensaje.get("carne", "desconocido"),
                mensaje.get("total_ejecuciones", 0),
                json.dumps(mensaje.get("por_hora", {})),
            ),
        )
        con.commit()
    log.info("resumen del cron almacenado (%s ejecuciones)", mensaje.get("total_ejecuciones"))


MANEJADORES = {
    COLA_LOTES: procesar_lote_aprobado,
    COLA_RESUMEN: procesar_resumen_cron,
}


# ---------------------------------------------------------------------
# Bucle de consumo
# ---------------------------------------------------------------------

def _construir_callback(cola: str):
    manejador = MANEJADORES[cola]

    def callback(canal, metodo, propiedades, cuerpo):
        try:
            mensaje = json.loads(cuerpo.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            # Mensaje ilegible: descartarlo. Devolverlo a la cola lo haria
            # circular para siempre.
            log.error("mensaje ilegible en %s, se descarta: %s", cola, exc)
            canal.basic_nack(delivery_tag=metodo.delivery_tag, requeue=False)
            return

        try:
            manejador(mensaje)
        except ErrorPermanente as exc:
            log.error("mensaje invalido en %s, se descarta: %s", cola, exc)
            canal.basic_nack(delivery_tag=metodo.delivery_tag, requeue=False)
            return
        except Exception as exc:  # noqa: BLE001
            # Fallo transitorio (por ejemplo, la base de datos no
            # responde). Se devuelve a la cola para reintentarlo.
            log.warning("fallo transitorio en %s, se reencola: %s", cola, exc)
            canal.basic_nack(delivery_tag=metodo.delivery_tag, requeue=True)
            time.sleep(2)
            return

        # ACK SOLO DESPUES de procesar con exito. Si el worker muere
        # antes de esta linea, RabbitMQ vuelve a entregar el mensaje.
        canal.basic_ack(delivery_tag=metodo.delivery_tag)

    return callback


# Margen de espera de las dependencias al arrancar. En Kubernetes el pod
# puede arrancar antes de que CoreDNS resuelva o antes de que el broker
# acepte conexiones; en un cluster administrado ese desfase es mayor que
# en uno local, porque los pods se reparten entre nodos.
ESPERA_INTENTOS = int(os.environ.get("ESPERA_INTENTOS", "40"))
ESPERA_SEGUNDOS = float(os.environ.get("ESPERA_SEGUNDOS", "3"))


def _conectar_broker() -> pika.BlockingConnection:
    """Conecta al broker reintentando hasta agotar el margen.

    Se captura Exception y no solo AMQPConnectionError: cuando CoreDNS
    aun no resuelve, el fallo sube como socket.gaierror y no como una
    excepcion de pika.
    """
    parametros = pika.URLParameters(RABBITMQ_URL)
    parametros.heartbeat = 30

    for intento in range(1, ESPERA_INTENTOS + 1):
        try:
            return pika.BlockingConnection(parametros)
        except Exception as exc:  # noqa: BLE001
            log.warning("esperando RabbitMQ (%s/%s): %s", intento, ESPERA_INTENTOS, exc)
            time.sleep(ESPERA_SEGUNDOS)

    raise RuntimeError(f"no se pudo conectar a RabbitMQ tras {ESPERA_INTENTOS} intentos")


def _consumir() -> None:
    """Abre la conexion, se suscribe y consume hasta que la conexion caiga."""
    conexion = _conectar_broker()
    try:
        canal = conexion.channel()

        for cola in MANEJADORES:
            # durable=True: la cola sobrevive al reinicio del broker.
            canal.queue_declare(queue=cola, durable=True)
            canal.basic_consume(queue=cola, on_message_callback=_construir_callback(cola),
                                auto_ack=False)

        # prefetch=1: el broker no entrega un mensaje nuevo hasta que el
        # anterior fue confirmado. Evita que un worker acapare la cola
        # mientras otros estan ociosos.
        canal.basic_qos(prefetch_count=1)

        ARCHIVO_LISTO.write_text("ok", encoding="utf-8")
        _tocar_latido()
        log.info("consumiendo de: %s", ", ".join(MANEJADORES))

        while True:
            # Se procesan eventos en ventanas de 5 segundos para poder
            # actualizar el latido aunque no llegue ningun mensaje.
            conexion.process_data_events(time_limit=5)
            _tocar_latido()
    finally:
        try:
            if conexion.is_open:
                conexion.close()
        except Exception:  # noqa: BLE001
            pass


def main() -> None:
    inicializar()

    # Bucle de reconexion. Sin el, cualquier caida o reagendamiento del
    # broker mata el proceso: en un cluster de nube el pod de RabbitMQ SE
    # VA A MOVER, y el worker debe sobrevivirlo en vez de depender de que
    # Kubernetes lo reinicie.
    while True:
        try:
            _consumir()
        except Exception as exc:  # noqa: BLE001
            log.warning("conexion con el broker perdida, reconectando: %s", exc)
            # El archivo de readiness se retira: mientras no haya broker,
            # este pod no esta listo para consumir.
            ARCHIVO_LISTO.unlink(missing_ok=True)
            time.sleep(ESPERA_SEGUNDOS)


if __name__ == "__main__":
    main()
