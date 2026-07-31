# API REST — Solicitudes Operativas

API REST para gestionar las solicitudes operativas de una academia ficticia, desarrollada
aplicando los principios SOLID y buenas prácticas de código limpio.

- **Lenguaje:** JavaScript (Node.js)
- **Framework:** Express
- **Base de datos:** PostgreSQL

---

## 1. Cómo ejecutar el proyecto

1. Instalar dependencias:

```bash
npm install
```

2. Crear la tabla en PostgreSQL ejecutando el archivo `db/schema.sql`.

3. Copiar `.env.example` a `.env` y colocar la cadena de conexión real:

```
DATABASE_URL=postgresql://usuario:password@host:5432/nombre_bd
PORT=3000
```

4. Levantar el servidor:

```bash
npm start
```

---

## 2. Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/solicitudes` | Obtiene todas las solicitudes |
| POST | `/api/solicitudes` | Registra una nueva solicitud |
| PUT | `/api/solicitudes/:id` | Actualiza por completo una solicitud |
| DELETE | `/api/solicitudes/:id` | Elimina una solicitud |
| PATCH | `/api/solicitudes/:id/estado` | Actualiza únicamente el estado |

**Ejemplo de body para POST y PUT:**

```json
{
  "titulo": "Adquisición de nuevo servidor",
  "area_solicitante": "Infraestructura TI",
  "prioridad": 3,
  "costo_estimado": 2500.00,
  "estado": "registrada"
}
```

**Ejemplo de body para PATCH:**

```json
{ "estado": "en_proceso" }
```

**Códigos de respuesta usados:** `200` OK, `201` creado, `400` datos inválidos,
`404` no encontrado, `500` error interno.

---

## 3. Estructura del proyecto

```
P1/
├── db/
│   └── schema.sql
└── src/
    ├── config/       → conexión a la base de datos
    ├── repositories/ → acceso a datos (SQL)
    ├── services/     → lógica de negocio
    ├── validators/   → validación de datos de entrada
    ├── controllers/  → manejo de peticiones HTTP
    ├── routes/       → definición de rutas
    ├── app.js
    └── server.js
```

Cada carpeta tiene una única razón para cambiar, lo cual es la base sobre la que se
apoyan los cinco principios explicados abajo.

---

## 4. Principios SOLID aplicados

### 4.1 S — Principio de Responsabilidad Única (SRP)

**Con mis palabras:** cada clase debe encargarse de una sola tarea. Si al describir lo que
hace una clase tengo que usar la palabra "y", probablemente esté haciendo de más. La ventaja
es que cuando algo falla, sé exactamente en qué archivo buscar.

**Dónde lo apliqué:** separé en cuatro capas lo que normalmente se escribe en un solo archivo.
El controlador solo traduce HTTP, el servicio solo decide reglas de negocio, el repositorio
solo habla con la base de datos y el validador solo revisa datos.

`src/controllers/SolicitudController.js` — el controlador **no** valida ni consulta la base
de datos, únicamente delega y responde:

```javascript
crear = async (req, res) => {
    try {
        const nueva = await this.servicio.registrarSolicitud(req.body);
        res.status(201).json(nueva);
    } catch (error) {
        this.#manejarError(error, res);
    }
};
```

`src/validators/SolicitudValidator.js` — toda la validación vive aquí y en ningún otro lado:

```javascript
static validarEstado(estado) {
    const errores = [];
    if (!ESTADOS_PERMITIDOS.includes(estado)) {
        errores.push(`El campo estado debe ser uno de: ${ESTADOS_PERMITIDOS.join(', ')}.`);
    }
    return errores;
}
```

---

### 4.2 O — Principio Abierto/Cerrado (OCP)

**Con mis palabras:** debo poder agregar comportamiento nuevo sin editar el código que ya
funciona. Si para añadir una opción tengo que abrir cinco archivos y meter un `if` en cada
uno, el diseño está mal.

**Dónde lo apliqué:** los estados válidos están en una sola constante. Si mañana la academia
necesita el estado `cancelada`, se agrega al arreglo y todo el sistema lo acepta: el
validador, el servicio y el controlador quedan intactos.

`src/validators/SolicitudValidator.js`:

```javascript
const ESTADOS_PERMITIDOS = ['registrada', 'en_proceso', 'finalizada'];
```

El mensaje de error también se construye a partir de esa lista, así que se actualiza solo:

```javascript
errores.push(`El campo estado debe ser uno de: ${ESTADOS_PERMITIDOS.join(', ')}.`);
```

---

### 4.3 L — Principio de Sustitución de Liskov (LSP)

**Con mis palabras:** si una clase hija reemplaza a la clase padre, el programa debe seguir
funcionando sin sorpresas. La hija tiene que respetar el mismo contrato: mismos métodos,
mismos parámetros y el mismo tipo de resultado.

**Dónde lo apliqué:** `PostgresSolicitudRepository` extiende de `SolicitudRepository` y
respeta exactamente su firma. Si más adelante hiciera un `MongoSolicitudRepository` o un
`RepositorioEnMemoria` para pruebas, podría cambiarlo en `solicitudRoutes.js` y el servicio
ni se enteraría.

`src/repositories/SolicitudRepository.js` — el contrato:

```javascript
class SolicitudRepository {
    async obtenerTodas() {
        throw new Error('Metodo no implementado');
    }

    async obtenerPorId(id) {
        throw new Error('Metodo no implementado');
    }
    // ...
}
```

`src/repositories/PostgresSolicitudRepository.js` — la implementación cumple el contrato:

```javascript
class PostgresSolicitudRepository extends SolicitudRepository {

    async obtenerTodas() {
        const resultado = await pool.query(
            'SELECT * FROM solicitudes ORDER BY id ASC'
        );
        return resultado.rows.map(this.#formatear);
    }
}
```

Todos los métodos que buscan un registro devuelven el objeto o `null`, nunca lanzan un error
distinto ni cambian el tipo de retorno. Eso es lo que permite sustituir una implementación
por otra sin romper nada.

---

### 4.4 I — Principio de Segregación de Interfaces (ISP)

**Con mis palabras:** es mejor tener varias interfaces pequeñas y específicas que una sola
gigante. Ninguna clase debería verse obligada a depender de métodos que no usa.

**Dónde lo apliqué:** en lugar de una clase "utilidades" que hiciera de todo, el validador
expone métodos separados y cada quien usa solo el que necesita. La ruta PATCH nunca toca
la validación completa, porque solo modifica el estado:

`src/services/SolicitudService.js` — `cambiarEstado` usa únicamente `validarEstado`:

```javascript
async cambiarEstado(id, estado) {
    this.#verificarId(id);

    const errores = SolicitudValidator.validarEstado(estado);
    if (errores.length > 0) {
        throw { tipo: 'VALIDACION', errores };
    }

    const actualizada = await this.repositorio.actualizarEstado(id, estado);
    // ...
}
```

Mientras que `registrarSolicitud` usa la validación completa:

```javascript
async registrarSolicitud(datos) {
    const errores = SolicitudValidator.validarSolicitudCompleta(datos);
    if (errores.length > 0) {
        throw { tipo: 'VALIDACION', errores };
    }
    return await this.repositorio.crear(datos);
}
```

Cada operación depende solo de lo que realmente ocupa.

---

### 4.5 D — Principio de Inversión de Dependencias (DIP)

**Con mis palabras:** las clases importantes (la lógica de negocio) no deben depender de
detalles como cuál base de datos se usa. Ambas deben depender de una abstracción. En la
práctica esto significa que el servicio recibe el repositorio desde afuera en lugar de
construirlo él mismo.

**Dónde lo apliqué:** `SolicitudService` no importa `pg` ni `PostgresSolicitudRepository`.
Recibe el repositorio por constructor:

`src/services/SolicitudService.js`:

```javascript
class SolicitudService {

    constructor(repositorio) {
        this.repositorio = repositorio;
    }

    async listarSolicitudes() {
        return await this.repositorio.obtenerTodas();
    }
}
```

El ensamblaje ocurre en un solo punto, `src/routes/solicitudRoutes.js`:

```javascript
const repositorio = new PostgresSolicitudRepository();
const servicio = new SolicitudService(repositorio);
const controlador = new SolicitudController(servicio);
```

Cambiar de PostgreSQL a otra base de datos significa modificar una sola línea de todo el
proyecto.

---

## 5. Prácticas de código seguro aplicadas

- **Prevención de inyección SQL:** todas las consultas usan parámetros (`$1`, `$2`), nunca
  concatenación de texto.

  ```javascript
  const resultado = await pool.query(
      'SELECT * FROM solicitudes WHERE id = $1',
      [id]
  );
  ```

- **Validación de entradas:** se verifica tipo, rango y obligatoriedad antes de tocar la
  base de datos (`prioridad` entre 1 y 5, `costo_estimado` no negativo, `estado` dentro de
  la lista permitida).

- **Doble barrera en la base de datos:** el `schema.sql` incluye restricciones `CHECK`, así
  que aunque alguien escribiera directamente en la BD, los datos inválidos se rechazan.

- **Manejo de errores sin filtrar información:** el detalle técnico se imprime en consola,
  al cliente solo le llega un mensaje genérico.

  ```javascript
  console.error(error);
  return res.status(500).json({ errores: ['Ocurrio un error interno en el servidor.'] });
  ```

- **Credenciales fuera del código:** la cadena de conexión vive en `.env`, que está incluido
  en `.gitignore`.

---

## 6. Documentación de uso de IA

El registro de los prompts utilizados, las respuestas obtenidas y los ajustes aplicados
se encuentra en el archivo [PROMPTS.md](./PROMPTS.md).
