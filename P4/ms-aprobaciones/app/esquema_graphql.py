"""Esquema GraphQL del microservicio de aprobaciones (Strawberry).

Segundo servicio con GraphQL, como exige el enunciado.

Aqui GraphQL aporta valor porque una solicitud y sus pasos forman un
arbol: el cliente a veces quiere solo el estado y a veces el detalle
completo de quien aprobo cada paso. Con GraphQL se pide lo justo.
"""
from __future__ import annotations

from datetime import datetime

import strawberry

from app import servicio


@strawberry.type
class Paso:
    id: int
    numero_paso: int
    rol_requerido: str
    usuario_id: str
    decision: str
    comentario: str | None
    decidido_en: str


@strawberry.type
class Solicitud:
    id: int
    lote_id: int
    monto_total: float
    estado: str
    paso_actual: int
    creado_en: str

    @strawberry.field
    def pasos(self) -> list[Paso]:
        # Resolucion perezosa: solo consulta si el cliente pidio el campo.
        return [_a_paso(p) for p in servicio.pasos_de(self.id)]


def _fecha(valor) -> str:
    return valor.isoformat() if isinstance(valor, datetime) else str(valor)


def _a_paso(f: dict) -> Paso:
    return Paso(
        id=f["id"],
        numero_paso=f["numero_paso"],
        rol_requerido=f["rol_requerido"],
        usuario_id=f["usuario_id"],
        decision=f["decision"],
        comentario=f["comentario"],
        decidido_en=_fecha(f["decidido_en"]),
    )


def _a_solicitud(f: dict) -> Solicitud:
    return Solicitud(
        id=f["id"],
        lote_id=f["lote_id"],
        monto_total=float(f["monto_total"]),
        estado=f["estado"],
        paso_actual=f["paso_actual"],
        creado_en=_fecha(f["creado_en"]),
    )


@strawberry.type
class Query:
    @strawberry.field
    def solicitudes(self) -> list[Solicitud]:
        return [_a_solicitud(s) for s in servicio.listar_solicitudes()]

    @strawberry.field
    def solicitud(self, id: int) -> Solicitud | None:
        f = servicio.obtener_solicitud(id)
        return _a_solicitud(f) if f else None


@strawberry.type
class Mutation:
    @strawberry.mutation
    def crear_solicitud(self, lote_id: int, monto_total: float) -> Solicitud:
        return _a_solicitud(servicio.crear_solicitud(lote_id, monto_total))

    @strawberry.mutation
    def registrar_paso(
        self, solicitud_id: int, usuario_id: str, decision: str, comentario: str | None = None
    ) -> Solicitud:
        return _a_solicitud(
            servicio.registrar_paso(solicitud_id, usuario_id, decision, comentario)
        )


schema = strawberry.Schema(query=Query, mutation=Mutation)
