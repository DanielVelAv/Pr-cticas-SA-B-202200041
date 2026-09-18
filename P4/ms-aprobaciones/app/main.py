"""Microservicio de aprobaciones: REST + GraphQL sobre FastAPI."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from strawberry.fastapi import GraphQLRouter

from app import servicio
from app.db import inicializar
from app.esquema_graphql import schema


@asynccontextmanager
async def lifespan(app: FastAPI):
    inicializar()
    yield


app = FastAPI(
    title="ms-aprobaciones",
    description="Flujo de aprobacion maker-checker-authorizer",
    version="1.0.0",
    lifespan=lifespan,
)


class SolicitudNueva(BaseModel):
    lote_id: int = Field(gt=0)
    monto_total: float = Field(ge=0)


class DecisionPaso(BaseModel):
    decision: str = Field(pattern="^(APROBADO|RECHAZADO)$")
    comentario: str | None = None


@app.get("/health", tags=["salud"])
def health():
    return {"servicio": "ms-aprobaciones", "estado": "ok"}


@app.get("/solicitudes", tags=["solicitudes"])
def listar():
    return {"solicitudes": servicio.listar_solicitudes()}


@app.get("/solicitudes/{solicitud_id}", tags=["solicitudes"])
def obtener(solicitud_id: int):
    s = servicio.obtener_solicitud(solicitud_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    s["pasos"] = servicio.pasos_de(solicitud_id)
    return s


@app.post("/solicitudes", status_code=201, tags=["solicitudes"])
def crear(cuerpo: SolicitudNueva):
    return servicio.crear_solicitud(cuerpo.lote_id, cuerpo.monto_total)


@app.post("/solicitudes/{solicitud_id}/pasos", tags=["solicitudes"])
def registrar_paso(
    solicitud_id: int,
    cuerpo: DecisionPaso,
    x_usuario_id: str = Header(default="anonimo"),
):
    """El API Gateway valida el token y propaga la identidad por encabezado."""
    try:
        return servicio.registrar_paso(
            solicitud_id, x_usuario_id, cuerpo.decision, cuerpo.comentario
        )
    except servicio.ErrorNegocio as exc:
        # 409 y no 403: el usuario tiene el rol, lo que falla es el
        # estado de la solicitud (ya participo antes).
        raise HTTPException(status_code=409, detail=str(exc)) from exc


app.include_router(GraphQLRouter(schema), prefix="/graphql")
