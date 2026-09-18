import os

# app/db.py lee DATABASE_URL al importarse (os.environ["DATABASE_URL"]).
# En el pipeline de CI no hay Postgres real disponible ni es necesario:
# las pruebas de este archivo mockean la conexion. Este valor solo evita
# que el import falle con KeyError; nunca se usa para conectar de verdad.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
