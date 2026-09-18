"""Microservicio de notificaciones (REST).

Version implementada del servicio disenado en la Practica 3. El envio
real por SMTP queda fuera del alcance de esta practica: la notificacion
se registra y se marca como enviada, que es lo que permite auditarla.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.db import conectar, inicializar


@asynccontextmanager
async def lifespan(app: FastAPI):
    inicializar()
    yield


app = FastAPI(
    title="ms-notificaciones",
    description="Registro y despacho de notificaciones a beneficiarios",
    version="1.0.0",
    lifespan=lifespan,
)


class NotificacionNueva(BaseModel):
    lote_id: int = Field(gt=0)
    destinatario_email: EmailStr
    nombre: str = Field(min_length=1, max_length=120)
    monto: float = Field(ge=0)


@app.get("/health", tags=["salud"])
def health():
    return {"servicio": "ms-notificaciones", "estado": "ok"}


@app.get("/notificaciones", tags=["notificaciones"])
def listar():
    with conectar() as con:
        filas = con.execute("SELECT * FROM notificaciones ORDER BY id DESC").fetchall()
    return {"notificaciones": filas}


@app.get("/notificaciones/lote/{lote_id}", tags=["notificaciones"])
def por_lote(lote_id: int):
    with conectar() as con:
        filas = con.execute(
            "SELECT * FROM notificaciones WHERE lote_id = %s ORDER BY id", (lote_id,)
        ).fetchall()
    return {"lote_id": lote_id, "notificaciones": filas}


@app.post("/notificaciones", status_code=201, tags=["notificaciones"])
def crear(cuerpo: NotificacionNueva):
    """Renderiza la plantilla y registra la notificacion."""
    with conectar() as con:
        plantilla = con.execute(
            "SELECT * FROM plantillas WHERE codigo = %s", ("LOTE_APROBADO",)
        ).fetchone()
        if plantilla is None:
            raise HTTPException(status_code=500, detail="Plantilla no encontrada")

        texto = (
            plantilla["cuerpo"]
            .replace("{nombre}", cuerpo.nombre)
            .replace("{lote}", str(cuerpo.lote_id))
            .replace("{monto}", f"{cuerpo.monto:.2f}")
        )
        fila = con.execute(
            """INSERT INTO notificaciones
                 (lote_id, destinatario_email, asunto, cuerpo, estado, intentos)
               VALUES (%s, %s, %s, %s, 'ENVIADA', 1) RETURNING *""",
            (cuerpo.lote_id, str(cuerpo.destinatario_email), plantilla["asunto"], texto),
        ).fetchone()
        con.commit()
        return fila
