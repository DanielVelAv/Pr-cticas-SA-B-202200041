"""Pruebas del flujo maker-checker-authorizer (app/servicio.py).

Se ejecuta la funcion real `registrar_paso`, sustituyendo unicamente la
conexion a la base de datos por un doble de prueba (fake). Esto permite
verificar las reglas de negocio reales sin necesitar un Postgres
levantado en el pipeline de CI, sin reescribir la logica que se prueba.
"""
from __future__ import annotations

import pytest

from app import servicio
from app.servicio import ErrorNegocio


class _CursorFalso:
    """Simula lo minimo de un cursor de psycopg que usa registrar_paso."""

    def __init__(self, solicitud: dict | None, pasos_previos: list[dict]):
        self._solicitud = solicitud
        self._pasos_previos = pasos_previos
        self._ultima_consulta_fue_pasos = False

    def execute(self, query: str, params=None):
        # Distingue la consulta de "pasos previos" de la de "solicitud",
        # igual que lo haria psycopg segun el SQL real de servicio.py.
        self._ultima_consulta_fue_pasos = "FROM pasos" in query
        return self

    def fetchone(self):
        return self._solicitud

    def fetchall(self):
        return self._pasos_previos

    def commit(self):
        pass


class _ConexionFalsa:
    def __init__(self, solicitud: dict | None, pasos_previos: list[dict]):
        self._cursor = _CursorFalso(solicitud, pasos_previos)

    def __enter__(self):
        return self._cursor

    def __exit__(self, *exc):
        return False

    def execute(self, query, params=None):
        return self._cursor.execute(query, params)

    def commit(self):
        pass


def _preparar(monkeypatch, solicitud, pasos_previos=None):
    conexion = _ConexionFalsa(solicitud, pasos_previos or [])
    monkeypatch.setattr(servicio, "conectar", lambda: conexion)


def test_rechaza_decision_invalida(monkeypatch):
    _preparar(monkeypatch, solicitud={"estado": "EN_CURSO", "paso_actual": 1})
    with pytest.raises(ErrorNegocio, match="APROBADO o RECHAZADO"):
        servicio.registrar_paso(1, usuario_id="1", decision="TAL_VEZ")


def test_rechaza_solicitud_inexistente(monkeypatch):
    _preparar(monkeypatch, solicitud=None)
    with pytest.raises(ErrorNegocio, match="no existe"):
        servicio.registrar_paso(999, usuario_id="1", decision="APROBADO")


def test_rechaza_solicitud_que_ya_no_esta_en_curso(monkeypatch):
    _preparar(monkeypatch, solicitud={"estado": "APROBADA", "paso_actual": 3})
    with pytest.raises(ErrorNegocio, match="ya esta APROBADA"):
        servicio.registrar_paso(1, usuario_id="1", decision="APROBADO")


def test_rechaza_segregacion_de_funciones(monkeypatch):
    """Un usuario no puede participar dos veces en la misma solicitud."""
    _preparar(
        monkeypatch,
        solicitud={"estado": "EN_CURSO", "paso_actual": 2},
        pasos_previos=[{"usuario_id": "1"}],
    )
    with pytest.raises(ErrorNegocio, match="Segregacion de funciones"):
        servicio.registrar_paso(1, usuario_id="1", decision="APROBADO")


def test_acepta_un_usuario_distinto_en_el_siguiente_paso(monkeypatch):
    """El mismo escenario anterior, pero con un usuario_id distinto: no debe
    fallar por segregacion de funciones (puede fallar mas adelante en el
    codigo real por el UPDATE, que este doble no simula, pero NO debe
    lanzar ErrorNegocio de segregacion)."""
    _preparar(
        monkeypatch,
        solicitud={"estado": "EN_CURSO", "paso_actual": 2},
        pasos_previos=[{"usuario_id": "1"}],
    )
    try:
        servicio.registrar_paso(1, usuario_id="2", decision="APROBADO")
    except ErrorNegocio as exc:
        assert "Segregacion" not in str(exc)
