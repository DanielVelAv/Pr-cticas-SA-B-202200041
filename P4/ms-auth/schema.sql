-- Base de datos exclusiva de la Practica 2.
--
-- No hay columna de correo en texto plano: el correo se guarda cifrado
-- con AES-256-GCM y se BUSCA por email_index, un HMAC determinista.
-- Sin ese indice el login seria imposible, porque AES-GCM usa un IV
-- aleatorio y cifrar el mismo correo dos veces da resultados distintos.

CREATE TABLE IF NOT EXISTS usuarios (
    id              SERIAL PRIMARY KEY,

    -- HMAC-SHA256 del correo normalizado. 32 bytes exactos.
    email_index     BYTEA        NOT NULL UNIQUE,

    -- iv(12) || ciphertext || tag(16)
    email_enc       BYTEA        NOT NULL,
    nombre_enc      BYTEA        NOT NULL,

    -- AES-256-GCM sobre el hash bcrypt (no sobre la contrasena).
    password_enc    BYTEA        NOT NULL,

    rol             VARCHAR(10)  NOT NULL DEFAULT 'cliente'
                    CHECK (rol IN ('admin', 'cliente')),

    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
