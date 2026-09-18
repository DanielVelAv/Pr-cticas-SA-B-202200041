# syntax=docker/dockerfile:1
# ---------- Etapa 1: dependencias ----------
FROM python:3.12-slim AS builder
WORKDIR /build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt ./
RUN pip install --prefix=/install -r requirements.txt

# ---------- Etapa 2: runtime ----------
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH="/install/lib/python3.12/site-packages" \
    PATH="/install/bin:$PATH"

RUN groupadd --gid 1000 app && \
    useradd --uid 1000 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder /install /install
COPY --chown=app:app registrar.py ./

USER 1000
CMD ["python", "registrar.py"]
