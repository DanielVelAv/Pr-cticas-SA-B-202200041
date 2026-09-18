# syntax=docker/dockerfile:1
# ---------- Etapa 1: construccion de dependencias ----------
# Las ruedas se compilan aqui; la imagen final no lleva compiladores
# ni el cache de pip.
FROM python:3.12-slim AS builder
WORKDIR /build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt ./
RUN pip install --prefix=/install -r requirements.txt

# ---------- Etapa 2: runtime ----------
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/install/bin:$PATH" \
    PYTHONPATH="/install/lib/python3.12/site-packages"

# Usuario sin privilegios: obligatorio para runAsNonRoot: true
RUN groupadd --gid 1000 app && \
    useradd --uid 1000 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder /install /install
COPY --chown=app:app app ./app

USER 1000
EXPOSE 3003
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3003"]
