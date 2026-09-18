# Diagramas de secuencia — flujos críticos

Cuatro flujos. El enunciado nombra tres explícitamente (aprobación de 3 pasos, envío al core bancario, notificación a clientes); se agrega la **carga y validación del CSV** porque es el punto donde se ve la integración con el módulo de autenticación de la Práctica 2 y donde se aplican las reglas de validación del negocio.

---

## 1. Carga y validación del archivo CSV

Muestra la integración con OAuth corporativo y con el servicio de autorización reutilizado de la Práctica 2.

```mermaid
sequenceDiagram
    autonumber
    actor MK as Usuario (maker)
    participant W as Portal Web
    participant GW as API Gateway
    participant OA as OAuth Corporativo
    participant AZ as Autorizacion (P2)
    participant L as ms-lotes
    participant S3 as Almacenamiento S3
    participant DB as BD lotes
    participant MQ as RabbitMQ

    MK->>W: selecciona archivo CSV
    W->>GW: POST /api/lotes (multipart + token OAuth)

    rect rgb(251, 241, 224)
    Note over GW,AZ: Autenticacion y autorizacion
    GW->>OA: valida firma y expiracion del token
    OA-->>GW: token valido (sub, identidad)
    GW->>AZ: evaluarPermiso(sub, "lotes:cargar")
    AZ-->>GW: permitido
    end

    GW->>L: POST /lotes (X-Correlation-Id)
    L->>S3: PUT archivo original
    S3-->>L: ruta + ETag
    L->>L: calcula SHA-256 del archivo
    L->>DB: INSERT Lote (estado = CARGADO)
    L-->>GW: 202 Accepted (loteId)
    GW-->>W: 202 loteId
    W-->>MK: "lote recibido, validando"

    rect rgb(231, 245, 239)
    Note over L,DB: Validacion asincrona de reglas de negocio
    L->>L: parsea CSV a transacciones
    loop por cada transaccion
        L->>L: ReglaSaldoDisponible
        L->>L: ReglaLimiteTransaccion
        L->>L: ReglaCuentaValida
        L->>L: ReglaPrevencionFraude
        L->>DB: INSERT Transaccion + ResultadoValidacion
    end
    end

    alt todas las transacciones son validas
        L->>DB: UPDATE Lote estado = VALIDADO
        L->>MQ: publica LoteValidado (loteId, montoTotal)
    else al menos una transaccion invalida
        L->>DB: UPDATE Lote estado = RECHAZADO
        Note over L: no se publica evento.<br/>el lote no entra a aprobacion
    end

    MK->>GW: GET /api/lotes/{loteId}
    GW->>L: consulta estado e informe
    L-->>MK: estado + errores de validacion por transaccion
```

**Por qué la respuesta es `202 Accepted` y no `200 OK`:** un lote de pago de planillas puede traer miles de filas. Validarlas dentro de la petición HTTP dejaría al usuario esperando y arriesgaría un timeout del navegador. Se acepta el archivo, se responde de inmediato con el `loteId`, y la validación corre aparte. El usuario consulta el resultado después.

**Por qué se calcula el SHA-256:** es la prueba de que el archivo que se descarga más tarde del historial es idéntico al que se cargó. En un sistema bancario auditable, el archivo original es evidencia y no puede alterarse.

**Por qué un lote rechazado no publica evento:** solo los lotes válidos entran al flujo de aprobación. Es lo que impide que una transacción que falló la validación de fraude llegue siquiera a presentarse a un aprobador.

---

## 2. Flujo de aprobación de 3 pasos (maker-checker-authorizer)

```mermaid
sequenceDiagram
    autonumber
    participant MQ as RabbitMQ
    participant A as ms-aprobaciones
    participant DB as BD aprobaciones
    participant GW as API Gateway
    participant AZ as Autorizacion (P2)
    actor MK as Maker
    actor CH as Checker
    actor AU as Authorizer

    MQ->>A: entrega LoteValidado (loteId, montoTotal)
    A->>DB: SELECT PoliticaAprobacion segun monto
    DB-->>A: politica (roles por paso)
    A->>DB: INSERT SolicitudAprobacion (paso_actual = 1)

    rect rgb(237, 233, 245)
    Note over MK,DB: Paso 1 — Maker
    MK->>GW: POST /aprobaciones/{id}/pasos {APROBADO}
    GW->>AZ: evaluarPermiso(sub, "aprobaciones:paso1")
    AZ-->>GW: permitido
    GW->>A: registrar decision
    A->>A: validarSegregacionFunciones(usuarioId)
    A->>DB: INSERT PasoAprobacion (1, MAKER, APROBADO)
    A->>DB: UPDATE paso_actual = 2
    A-->>MK: 200 paso 1 registrado
    end

    rect rgb(237, 233, 245)
    Note over CH,DB: Paso 2 — Checker
    CH->>GW: POST /aprobaciones/{id}/pasos {APROBADO}
    GW->>AZ: evaluarPermiso(sub, "aprobaciones:paso2")
    AZ-->>GW: permitido
    GW->>A: registrar decision
    A->>A: validarSegregacionFunciones(usuarioId)
    alt el usuario ya participo en un paso anterior
        A-->>CH: 409 Conflict — segregacion de funciones
    else usuario distinto
        A->>DB: INSERT PasoAprobacion (2, CHECKER, APROBADO)
        A->>DB: UPDATE paso_actual = 3
        A-->>CH: 200 paso 2 registrado
    end
    end

    rect rgb(237, 233, 245)
    Note over AU,DB: Paso 3 — Authorizer
    AU->>GW: POST /aprobaciones/{id}/pasos {APROBADO}
    GW->>AZ: evaluarPermiso(sub, "aprobaciones:paso3")
    AZ-->>GW: permitido
    GW->>A: registrar decision
    A->>A: validarSegregacionFunciones(usuarioId)
    A->>DB: INSERT PasoAprobacion (3, AUTHORIZER, APROBADO)
    end

    alt los tres pasos aprobados
        A->>DB: UPDATE SolicitudAprobacion estado = APROBADA
        Note over A,DB: continua en el flujo 3 (envio al core)
    else cualquier paso rechazado
        A->>DB: UPDATE estado = RECHAZADA, fecha_cierre
        A->>DB: INSERT EVENTO_OUTBOX (LoteRechazado)
        Note over A: el lote no se envia al core bancario
    end
```

**Los dos controles que ocurren en cada paso, y son distintos:**

| Control | Quién lo hace | Qué responde |
|---|---|---|
| `evaluarPermiso` | Servicio de autorización (Práctica 2) | ¿este usuario tiene el rol del paso? |
| `validarSegregacionFunciones` | `ms-aprobaciones` | ¿es una persona distinta a las anteriores? |

El primero es **autorización**; el segundo es **regla de negocio**. Confundirlos es el error típico: si la segregación de funciones viviera en el servicio de permisos, este tendría que conocer el historial de aprobaciones de cada lote, y dejaría de ser un servicio genérico de permisos.

**Por qué `409 Conflict` y no `403 Forbidden`:** el usuario sí tiene el rol (`403` sería mentira). Lo que falla es el estado de la solicitud: ya participó antes. `409` describe exactamente eso — un conflicto con el estado actual del recurso.

**Por qué la política se lee al crear la solicitud y no en cada paso:** para que un cambio de política a mitad del flujo no altere un lote ya en curso. Lo que se aprueba es lo que se pactó al inicio.

---

## 3. Envío al sistema core bancario

```mermaid
sequenceDiagram
    autonumber
    participant A as ms-aprobaciones
    participant DB as BD aprobaciones
    participant C as Core Bancario
    participant PUB as Publicador Outbox
    participant MQ as RabbitMQ

    Note over A,DB: la solicitud quedo en estado APROBADA
    A->>DB: INSERT EnvioCore (idempotency_key, estado = PENDIENTE)

    loop hasta CORE_MAX_INTENTOS, backoff exponencial con jitter
        A->>C: POST /transferencias (Idempotency-Key, lote)
        alt respuesta 2xx
            C-->>A: aceptado (referencia del core)
        else timeout, error de red o 5xx
            C--xA: falla transitoria
            A->>DB: UPDATE EnvioCore intentos + 1
            A->>A: espera min(base x 2^n, techo) x jitter
        else respuesta 4xx (lote mal formado)
            C-->>A: rechazado definitivo
            Note over A: no se reintenta.<br/>reintentar daria el mismo error
        end
    end

    alt envio aceptado por el core
        rect rgb(231, 245, 239)
        Note over A,DB: una sola transaccion de base de datos
        A->>DB: UPDATE EnvioCore estado = ACEPTADO
        A->>DB: UPDATE SolicitudAprobacion estado = ENVIADA
        A->>DB: INSERT EVENTO_OUTBOX (LoteAprobado)
        end
    else intentos agotados
        A->>DB: UPDATE EnvioCore estado = FALLIDO
        Note over A: alerta a operaciones.<br/>NO se reintenta automaticamente,<br/>requiere decision humana
    end

    PUB->>DB: SELECT eventos con publicado = false
    PUB->>MQ: publica LoteAprobado
    PUB->>DB: UPDATE publicado = true
```

**La `Idempotency-Key` es la pieza crítica.** Ante un timeout, el sistema no sabe si el core recibió la transferencia o no. Sin la llave habría que elegir entre no reintentar (y quizá nunca enviar el pago) o reintentar (y quizá duplicar transferencias reales de dinero). Con la llave, el core deduplica: reintentar es seguro.

**Por qué un `4xx` no se reintenta:** un lote mal formado va a fallar igual las cuatro veces. Solo se reintentan fallas *transitorias* — timeout, red caída, `5xx`. Es la misma clasificación que se implementó en la Práctica 2.

**Por qué al agotar los intentos NO se reintenta automáticamente:** en un sistema que mueve dinero, seguir reintentando en segundo plano tras una falla persistente es peligroso. Se marca como `FALLIDO`, se alerta a operaciones y una persona decide. Fallar de forma ruidosa y detenida es preferible a fallar en silencio.

**Por qué los tres `UPDATE`/`INSERT` van en una sola transacción:** es el patrón *Transactional Outbox*. Si el proceso se cayera entre "marcar como enviada" y "publicar el evento", el cliente nunca recibiría su correo. Escribiendo el evento en la misma transacción, el `Publicador Outbox` lo recoge después aunque el servicio se haya reiniciado.

---

## 4. Notificación a los clientes beneficiarios

```mermaid
sequenceDiagram
    autonumber
    participant MQ as RabbitMQ
    participant N as ms-notificaciones
    participant DB as BD notificaciones
    participant L as ms-lotes
    participant SMTP as Servidor SMTP
    actor B as Beneficiario

    MQ->>N: entrega LoteAprobado (eventoId, loteId)

    rect rgb(251, 241, 224)
    Note over N,DB: Deduplicacion (patron Inbox)
    N->>DB: SELECT EventoProcesado WHERE evento_id = ?
    alt el evento ya fue procesado
        DB-->>N: existe
        N-->>MQ: ACK sin reprocesar
    else primera vez que llega
        DB-->>N: no existe
        N->>DB: INSERT EventoProcesado (eventoId)
    end
    end

    N->>L: GET /lotes/{loteId}/beneficiarios
    L-->>N: lista (nombre, correo, monto, referencia)
    N->>DB: SELECT Plantilla activa

    loop por cada beneficiario del lote
        N->>DB: INSERT Notificacion (estado = PENDIENTE)
        N->>N: renderiza plantilla con datos del beneficiario
        N->>SMTP: enviar correo
        alt entregado al servidor
            SMTP-->>N: messageId
            N->>DB: UPDATE estado = ENVIADA, proveedor_message_id
            SMTP->>B: correo "su transaccion esta en proceso"
        else fallo de entrega
            SMTP--xN: error
            N->>DB: UPDATE intentos + 1, estado = FALLIDA
            Note over N,DB: se reintenta despues.<br/>tras N intentos pasa a DESCARTADA
        end
    end

    N-->>MQ: ACK del evento
```

**Por qué el evento lleva solo el `loteId` y no la lista completa de beneficiarios:** un lote de planilla puede traer miles de registros. Meterlos en el mensaje produciría eventos enormes, lentos de serializar y de propagar. El evento notifica *que algo pasó*; quien lo consume consulta el detalle si lo necesita.

El costo de esa decisión, que conviene reconocer: `ms-notificaciones` queda con una dependencia síncrona hacia `ms-lotes`. Es aceptable porque este flujo ya es asíncrono — nadie está esperando en pantalla. Si `ms-lotes` está caído, el mensaje no se confirma y RabbitMQ lo reintrega después.

**Por qué el `ACK` va al final y no al recibir:** si el servicio se cae a mitad del envío, el evento no fue confirmado y la cola lo vuelve a entregar. La tabla `EventoProcesado` evita entonces que se reenvíen los correos ya despachados.

**Por qué el fallo de un correo no detiene el lote:** que el buzón de un beneficiario esté lleno no debe impedir notificar a los otros 4,999. Cada notificación es independiente y tiene su propio contador de intentos.

---

## Cobertura de las reglas del negocio

| Regla del enunciado | Dónde se resuelve |
|---|---|
| Carga de transacciones vía CSV | Flujo 1 |
| Validación por reglas internas (saldo, límites, cuentas, fraude) | Flujo 1, bloque de validación asíncrona |
| Almacenamiento del archivo en la nube | Flujo 1, `PUT` a S3 |
| Autenticación OAuth + módulo de la Práctica 2 | Flujo 1 (bloque ámbar) y en cada paso del flujo 2 |
| Aprobación de 3 pasos por usuarios distintos | Flujo 2, con `validarSegregacionFunciones` |
| Envío al core bancario tras la aprobación | Flujo 3 |
| Correo a todos los beneficiarios del lote | Flujo 4 |
| Historial consultable con descarga | Flujo 1, consulta final; `hash_sha256` garantiza integridad |
| Logging centralizado y auditable | `X-Correlation-Id` propagado desde el flujo 1; el rastro de auditoría vive en `PasoAprobacion` |
