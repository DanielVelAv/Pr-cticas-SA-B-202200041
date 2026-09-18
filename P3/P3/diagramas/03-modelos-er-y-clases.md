# Modelos de datos y diagramas de clases

Cada microservicio es dueño exclusivo de su base de datos. **Ninguna consulta cruza de un servicio a la base de datos de otro**; la información que un servicio necesita de otro llega por evento o por llamada REST.

Cuando aparece un identificador de otro servicio (por ejemplo `lote_id` en `ms-aprobaciones`) **no se declara como llave foránea**: es una referencia externa. La integridad la garantiza el flujo de eventos, no el motor de base de datos.

---

## 1. `ms-lotes`

### 1.1 Modelo entidad-relación

```mermaid
erDiagram
    LOTE ||--o{ TRANSACCION : "contiene"
    TRANSACCION ||--o{ RESULTADO_VALIDACION : "genera"
    REGLA_VALIDACION ||--o{ RESULTADO_VALIDACION : "evalua"

    LOTE {
        uuid id PK
        varchar nombre_archivo
        varchar ruta_s3
        char hash_sha256
        varchar estado
        int total_transacciones
        decimal monto_total
        varchar usuario_carga_id
        timestamptz fecha_carga
    }

    TRANSACCION {
        uuid id PK
        uuid lote_id FK
        varchar cuenta_origen
        varchar cuenta_destino
        decimal monto
        char moneda
        varchar beneficiario_nombre
        varchar beneficiario_email
        varchar referencia
        varchar estado
    }

    RESULTADO_VALIDACION {
        uuid id PK
        uuid transaccion_id FK
        varchar regla_codigo FK
        varchar resultado
        varchar mensaje
        timestamptz fecha
    }

    REGLA_VALIDACION {
        varchar codigo PK
        varchar descripcion
        varchar tipo
        jsonb parametros
        boolean activa
    }
```

**Estados del lote:** `CARGADO → VALIDANDO → VALIDADO | RECHAZADO → EN_APROBACION → PROCESADO`

**Por qué `RESULTADO_VALIDACION` es una tabla y no una columna:** una transacción puede fallar varias reglas a la vez. Guardar solo un booleano obligaría al operador a corregir, recargar y descubrir el siguiente error uno por uno. Guardando cada resultado se devuelve el informe completo en una sola pasada.

**Por qué `REGLA_VALIDACION` vive en base de datos:** los límites de transacción y los umbrales de fraude cambian por decisión del negocio, no por despliegue. Con `parametros` en JSONB, ajustar un límite es un `UPDATE`, no una nueva versión del servicio.

### 1.2 Diagrama de clases

```mermaid
classDiagram
    direction LR

    class Lote {
        +UUID id
        +String nombreArchivo
        +String rutaS3
        +String hashSha256
        +EstadoLote estado
        +int totalTransacciones
        +BigDecimal montoTotal
        +marcarValidado() void
        +marcarRechazado() void
    }

    class Transaccion {
        +UUID id
        +String cuentaOrigen
        +String cuentaDestino
        +BigDecimal monto
        +String beneficiarioEmail
        +EstadoTransaccion estado
        +esValida() boolean
    }

    class ResultadoValidacion {
        +UUID id
        +String reglaCodigo
        +boolean aprobada
        +String mensaje
    }

    class ReglaValidacion {
        <<interface>>
        +codigo() String
        +validar(Transaccion) ResultadoValidacion
    }

    class ReglaSaldoDisponible {
        +validar(Transaccion) ResultadoValidacion
    }
    class ReglaLimiteTransaccion {
        +validar(Transaccion) ResultadoValidacion
    }
    class ReglaCuentaValida {
        +validar(Transaccion) ResultadoValidacion
    }
    class ReglaPrevencionFraude {
        +validar(Transaccion) ResultadoValidacion
    }

    class ValidadorLotes {
        -List~ReglaValidacion~ reglas
        +validar(Lote) InformeValidacion
    }

    class AlmacenamientoArchivos {
        <<interface>>
        +guardar(byte[], String) String
        +urlDescarga(String) String
    }
    class AlmacenamientoS3 {
        +guardar(byte[], String) String
        +urlDescarga(String) String
    }

    Lote "1" *-- "0..*" Transaccion
    Transaccion "1" --> "0..*" ResultadoValidacion
    ReglaValidacion <|.. ReglaSaldoDisponible
    ReglaValidacion <|.. ReglaLimiteTransaccion
    ReglaValidacion <|.. ReglaCuentaValida
    ReglaValidacion <|.. ReglaPrevencionFraude
    ValidadorLotes o-- "1..*" ReglaValidacion
    ValidadorLotes ..> Lote
    AlmacenamientoArchivos <|.. AlmacenamientoS3
    Lote ..> AlmacenamientoArchivos
```

**Patrón aplicado — Strategy.** Cada regla de negocio es una implementación de `ReglaValidacion`. Agregar una regla nueva (por ejemplo, lista negra de países) es crear una clase; `ValidadorLotes` no se modifica. Es el principio abierto/cerrado aplicado justo donde el negocio cambia más seguido.

---

## 2. `ms-aprobaciones`

### 2.1 Modelo entidad-relación

```mermaid
erDiagram
    POLITICA_APROBACION ||--o{ SOLICITUD_APROBACION : "rige"
    SOLICITUD_APROBACION ||--o{ PASO_APROBACION : "se resuelve en"
    SOLICITUD_APROBACION ||--o| ENVIO_CORE : "produce"

    SOLICITUD_APROBACION {
        uuid id PK
        uuid lote_id "referencia externa, sin FK"
        uuid politica_id FK
        decimal monto_total
        int total_transacciones
        varchar estado
        int paso_actual
        timestamptz fecha_creacion
        timestamptz fecha_cierre
    }

    PASO_APROBACION {
        uuid id PK
        uuid solicitud_id FK
        int numero_paso
        varchar rol_requerido
        varchar usuario_id
        varchar decision
        varchar comentario
        timestamptz fecha_decision
    }

    ENVIO_CORE {
        uuid id PK
        uuid solicitud_id FK
        uuid idempotency_key UK
        varchar estado
        int intentos
        varchar codigo_respuesta
        jsonb respuesta_core
        timestamptz fecha_envio
    }

    POLITICA_APROBACION {
        uuid id PK
        decimal monto_minimo
        decimal monto_maximo
        jsonb roles_por_paso
        boolean activa
    }

    EVENTO_OUTBOX {
        uuid id PK
        varchar tipo
        jsonb payload
        boolean publicado
        timestamptz fecha_creacion
        timestamptz fecha_publicacion
    }
```

**`monto_total` está duplicado respecto a `ms-lotes` a propósito.** La política de aprobación depende del monto. Consultar a `ms-lotes` en cada paso crearía una dependencia síncrona en el camino crítico: si ese servicio cae, nadie podría aprobar nada. Es además un *snapshot* inmutable — el monto aprobado fue el que existía al crear la solicitud.

**`idempotency_key` es única por diseño.** Es lo que permite reintentar el envío al core bancario sin riesgo de duplicar una transferencia. Ante un timeout ambiguo ("¿llegó o no llegó?"), sin esta llave habría que elegir entre no enviar o enviar dos veces; ninguna es aceptable en banca.

**`EVENTO_OUTBOX` no tiene relación con las demás tablas** porque implementa el patrón *Transactional Outbox*: el evento se escribe en la **misma transacción** que actualiza la aprobación. Si el servicio se cae antes de publicar en RabbitMQ, el evento sigue ahí y un proceso aparte lo publica después. Sin esto, un fallo entre "aprobar" y "publicar" perdería la notificación al cliente para siempre.

### 2.2 Diagrama de clases

```mermaid
classDiagram
    direction LR

    class SolicitudAprobacion {
        +UUID id
        +UUID loteId
        +BigDecimal montoTotal
        +EstadoSolicitud estado
        +int pasoActual
        +registrarDecision(PasoAprobacion) void
        +estaCompleta() boolean
    }

    class PasoAprobacion {
        +UUID id
        +int numeroPaso
        +RolAprobacion rolRequerido
        +String usuarioId
        +Decision decision
        +String comentario
    }

    class PoliticaAprobacion {
        +UUID id
        +BigDecimal montoMinimo
        +BigDecimal montoMaximo
        +rolParaPaso(int) RolAprobacion
        +aplicaA(BigDecimal) boolean
    }

    class EnvioCore {
        +UUID id
        +UUID idempotencyKey
        +EstadoEnvio estado
        +int intentos
    }

    class FlujoAprobacion {
        +avanzar(SolicitudAprobacion, String, Decision) void
        -validarSegregacionFunciones(SolicitudAprobacion, String) void
    }

    class ClienteCoreBancario {
        <<interface>>
        +enviarLote(SolicitudAprobacion, UUID) RespuestaCore
    }
    class ClienteCoreBancarioRest {
        -PoliticaReintentos reintentos
        +enviarLote(SolicitudAprobacion, UUID) RespuestaCore
    }

    class PoliticaReintentos {
        +maxIntentos int
        +backoffBaseMs int
        +ejecutar(Operacion) Resultado
    }

    class RolAprobacion {
        <<enumeration>>
        MAKER
        CHECKER
        AUTHORIZER
    }

    class EstadoSolicitud {
        <<enumeration>>
        EN_CURSO
        APROBADA
        RECHAZADA
        ENVIADA
    }

    SolicitudAprobacion "1" *-- "3" PasoAprobacion
    SolicitudAprobacion "1" --> "0..1" EnvioCore
    PoliticaAprobacion "1" --> "0..*" SolicitudAprobacion
    PasoAprobacion --> RolAprobacion
    SolicitudAprobacion --> EstadoSolicitud
    FlujoAprobacion ..> SolicitudAprobacion
    FlujoAprobacion ..> PoliticaAprobacion
    ClienteCoreBancario <|.. ClienteCoreBancarioRest
    ClienteCoreBancarioRest o-- PoliticaReintentos
    FlujoAprobacion ..> ClienteCoreBancario
```

**`validarSegregacionFunciones` es el corazón de maker-checker-authorizer.** Antes de registrar el paso N verifica que ese `usuario_id` no aparezca en ningún paso anterior de la misma solicitud. Son dos controles distintos y conviene separarlos al explicarlos:

| Pregunta | Quién la responde |
|---|---|
| ¿Este usuario tiene el rol de checker? | Servicio de autorización de la Práctica 2 |
| ¿Es una persona distinta a la del paso anterior? | `ms-aprobaciones`, regla de negocio |

**`PoliticaReintentos` es la misma pieza que ya se implementó en la Práctica 2**, reaplicada aquí para el envío al core bancario.

---

## 3. `ms-notificaciones`

### 3.1 Modelo entidad-relación

```mermaid
erDiagram
    PLANTILLA ||--o{ NOTIFICACION : "da formato a"

    NOTIFICACION {
        uuid id PK
        uuid lote_id "referencia externa, sin FK"
        uuid transaccion_id "referencia externa, sin FK"
        varchar destinatario_email
        varchar plantilla_codigo FK
        varchar estado
        int intentos
        varchar proveedor_message_id
        timestamptz fecha_envio
    }

    PLANTILLA {
        varchar codigo PK
        varchar asunto
        text cuerpo_html
        char idioma
        int version
        boolean activa
    }

    EVENTO_PROCESADO {
        uuid evento_id PK
        varchar tipo
        timestamptz fecha_procesado
    }
```

**`EVENTO_PROCESADO` implementa el patrón *Inbox* (deduplicación).** RabbitMQ garantiza entrega *al menos una vez*, así que recibir el mismo evento dos veces es un escenario real, no teórico. Antes de procesar, el servicio verifica si ya vio ese `evento_id`. Sin esta tabla, un reintento de la cola enviaría el correo dos veces a cada beneficiario del lote.

**`PLANTILLA` tiene `version`** porque una notificación enviada debe poder reconstruirse tal como se envió. Si alguien edita la plantilla en marzo, el correo de enero no cambia retroactivamente.

### 3.2 Diagrama de clases

```mermaid
classDiagram
    direction LR

    class Notificacion {
        +UUID id
        +UUID loteId
        +String destinatarioEmail
        +EstadoNotificacion estado
        +int intentos
        +String proveedorMessageId
        +marcarEnviada(String) void
        +marcarFallida() void
    }

    class Plantilla {
        +String codigo
        +String asunto
        +String cuerpoHtml
        +int version
        +renderizar(Map) String
    }

    class EventoProcesado {
        +UUID eventoId
        +String tipo
        +Instant fechaProcesado
    }

    class ServicioNotificaciones {
        +procesarLoteAprobado(EventoLoteAprobado) void
        -yaProcesado(UUID) boolean
    }

    class ProveedorCorreo {
        <<interface>>
        +enviar(Notificacion, String) String
    }
    class ProveedorCorreoSmtp {
        +enviar(Notificacion, String) String
    }

    class EstadoNotificacion {
        <<enumeration>>
        PENDIENTE
        ENVIADA
        FALLIDA
        DESCARTADA
    }

    Plantilla "1" --> "0..*" Notificacion
    Notificacion --> EstadoNotificacion
    ServicioNotificaciones ..> Notificacion
    ServicioNotificaciones ..> EventoProcesado
    ServicioNotificaciones ..> Plantilla
    ProveedorCorreo <|.. ProveedorCorreoSmtp
    ServicioNotificaciones ..> ProveedorCorreo
```

**`ProveedorCorreo` es una interfaz y no una clase concreta** porque el proveedor de correo es la pieza con más probabilidad de cambiar (de SMTP propio a SendGrid, SES o Mailgun). Cambiarlo es escribir una implementación nueva, sin tocar `ServicioNotificaciones`.

---

## Resumen de decisiones transversales

| Decisión | Razón |
|---|---|
| Una base de datos por microservicio | Evita acoplamiento invisible: dos servicios sobre la misma tabla ya no se despliegan ni escalan por separado |
| Referencias externas sin llave foránea | Consecuencia directa de lo anterior; la integridad la da el flujo de eventos |
| `monto_total` denormalizado en aprobaciones | Elimina una dependencia síncrona en el camino crítico y fija un *snapshot* inmutable |
| Reglas de validación como Strategy | El negocio cambia sus reglas con frecuencia; agregar una no debe tocar el validador |
| Outbox en aprobaciones | Un fallo entre "aprobar" y "publicar" perdería la notificación al cliente |
| Inbox en notificaciones | La cola entrega *al menos una vez*; sin deduplicar, se enviarían correos repetidos |

**El costo que se acepta, y conviene decirlo antes de que lo señalen:** al no haber una base de datos compartida, se pierden los `JOIN` entre servicios y las transacciones ACID distribuidas. Reconstruir el estado completo de un lote exige consultar dos servicios. Es el precio del desacoplamiento y es una decisión consciente, no un descuido.
