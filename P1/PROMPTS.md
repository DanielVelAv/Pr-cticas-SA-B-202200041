# Documentación de Prompts de IA

Registro de los prompts utilizados durante el desarrollo, la respuesta obtenida y el
análisis crítico con los ajustes aplicados.

**Herramienta utilizada:** Claude
**Fecha de desarrollo:** 30 de julio de 2026

> **Nota sobre el proceso:** la estructura inicial del proyecto se generó con apoyo de IA
> a partir del enunciado. Los tres prompts documentados a continuación corresponden a la
> fase de revisión, auditoría y endurecimiento del código, que es donde se concentró el
> trabajo de análisis crítico.

---

## Prompt 1 — Auditoría de seguridad del validador

### Prompt enviado

```
Actúa como revisor de seguridad de código.

Te voy a pasar el validador de entradas de una API REST en Node.js
con Express y PostgreSQL.

Analiza únicamente lo siguiente:

1. Qué valores maliciosos podrían pasar esta validación y llegar
   a la base de datos.
2. Considera específicamente: NaN, Infinity, notación científica,
   cadenas de longitud extrema, objetos anidados, y valores null.
3. Clasifica cada hallazgo como crítico, medio o menor.

No generes código todavía.
Dame solo el diagnóstico y espera mi siguiente instrucción.

[código de SolicitudValidator.js]
```

**Por qué está construido así:** restringe el alcance a un solo archivo, enumera los
vectores concretos a evaluar en lugar de pedir "revisa la seguridad" en general, exige
clasificación por severidad para poder priorizar, y prohíbe generar código para separar
el diagnóstico de la solución.

### Respuesta obtenida (resumen)

La IA descartó primero la inyección SQL, confirmando que las consultas parametrizadas del
repositorio ya la previenen. Los hallazgos relevantes fueron:

| Severidad | Hallazgo                                                                               |
| --------- | -------------------------------------------------------------------------------------- |
| Crítico   | `Infinity` pasa la validación de `costo_estimado`                                      |
| Medio     | Sin límite superior en `costo_estimado` (columna es `NUMERIC(12,2)`)                   |
| Medio     | Sin longitud máxima en `titulo` y `area_solicitante` (`VARCHAR(150)` y `VARCHAR(100)`) |
| Medio     | `validarId` acepta `"0x10"` y `"1e5"` vía `Number()`                                   |
| Medio     | Un cuerpo `null` rompe el destructuring                                                |
| Menor     | Falta normalización con `trim()` antes de guardar                                      |

Diagnóstico de fondo: **el validador y el esquema SQL no están sincronizados**, por lo que
errores del cliente se reportan como 500 en lugar de 400.

### Análisis crítico y ajustes aplicados

mi criterio es corregir lo que convierte un 500 en un 400, rechazar lo que es responsabilidad de otra capa como el XSS

- El hallazgo de `Infinity` es real y verificable: `typeof Infinity === 'number'` es
  verdadero, `Number.isNaN(Infinity)` es falso, e `Infinity < 0` es falso. Pasa las tres
  comprobaciones.

**Ajuste aplicado** en `src/validators/SolicitudValidator.js`:

```javascript
// Limites tomados directamente del esquema de la base de datos.
const LIMITES = {
    TITULO_MAX: 150,          // VARCHAR(150)
    AREA_MAX: 100,            // VARCHAR(100)
    COSTO_MAX: 9999999999.99  // NUMERIC(12,2)
};

static validarSolicitudCompleta(datos) {
    // Un cuerpo null o no-objeto rompe el destructuring y produce un 500.
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
        return ['El cuerpo de la peticion debe ser un objeto JSON valido.'];
    }

    const errores = [];
    const { titulo, area_solicitante, prioridad, costo_estimado, estado } = datos;

    if (!titulo || typeof titulo !== 'string' || titulo.trim().length === 0) {
        errores.push('El campo titulo es obligatorio y debe ser texto.');
    } else if (titulo.trim().length > LIMITES.TITULO_MAX) {
        errores.push(`El campo titulo no puede exceder ${LIMITES.TITULO_MAX} caracteres.`);
    }

    if (!area_solicitante || typeof area_solicitante !== 'string' || area_solicitante.trim().length === 0) {
        errores.push('El campo area_solicitante es obligatorio y debe ser texto.');
    } else if (area_solicitante.trim().length > LIMITES.AREA_MAX) {
        errores.push(`El campo area_solicitante no puede exceder ${LIMITES.AREA_MAX} caracteres.`);
    }

    if (!Number.isInteger(prioridad) || prioridad < 1 || prioridad > 5) {
        errores.push('El campo prioridad debe ser un entero entre 1 y 5.');
    }

    // Number.isFinite descarta NaN e Infinity en una sola comprobacion.
    if (!Number.isFinite(costo_estimado) || costo_estimado < 0 || costo_estimado > LIMITES.COSTO_MAX) {
        errores.push('El campo costo_estimado debe ser un numero entre 0 y 9999999999.99.');
    }

    if (!ESTADOS_PERMITIDOS.includes(estado)) {
        errores.push(`El campo estado debe ser uno de: ${ESTADOS_PERMITIDOS.join(', ')}.`);
    }

    return errores;
}
```

Los tres ajustes comparten la misma causa raíz: el validador desconocía las restricciones
del esquema. La constante `LIMITES` los centraliza y documenta su origen, de modo que si
cambia una columna solo hay un lugar que actualizar.

---

## Prompt 2 — Verificación de la aplicación de principios SOLID

### Prompt enviado

```
Te voy a pasar tres archivos de mi API REST.

Necesito que verifiques, archivo por archivo:

- Qué principio SOLID aplica cada uno.
- Si hay alguna violación real a esos principios.
- Si alguna capa está haciendo trabajo que le corresponde a otra.

Sé estricto. Si algo está aplicado solo de forma superficial,
dímelo explícitamente en lugar de aprobarlo.

No propongas refactorizaciones todavía.

[SolicitudService.js, SolicitudController.js, PostgresSolicitudRepository.js]
```

**Por qué está construido así:** pide verificación archivo por archivo en lugar de una
opinión general, instruye explícitamente a ser estricto para contrarrestar la tendencia de
la IA a aprobar el código que se le muestra, y separa el diagnóstico de la propuesta de
solución.

### Respuesta obtenida (resumen)

- **DIP** es el principio mejor aplicado: el servicio no importa `pg` ni Express.
- **ISP** se cumple: el PATCH usa `validarEstado` y no la validación completa.
- **LSP** es el más débil: existe la forma (herencia, firmas coincidentes) pero
  `SolicitudRepository` es una clase con métodos que lanzan error, no una interfaz real.
  Nada obliga a la subclase a implementarlos.
- **Fugas entre capas detectadas:** el controlador extrae `req.body.estado` (conoce la
  forma del payload), y el servicio lanza `'NO_ENCONTRADO'`, que equivale a decidir un 404.
- Se lanzan objetos literales en vez de clases que hereden de `Error`, por lo que no
  tienen stack trace.
- **Reportó como crítico** que `resultado.rows.map(this.#formatear)` perdería el contexto
  `this` y rompería el endpoint GET.

### Análisis crítico y ajustes aplicados

**Rechacé el hallazgo marcado como crítico.** La IA afirmó que el GET estaba roto por
pérdida del contexto `this` en `.map()`. Lo verifiqué contra la evidencia de mis pruebas:

```
$ curl http://localhost:3001/api/solicitudes
[{"id":2,"titulo":"Adquisición de nuevo servidor","area_solicitante":"Infraestructura TI",
"prioridad":3,"costo_estimado":2500,"estado":"registrada"}]
```

El endpoint responde 200 y devuelve `costo_estimado: 2500` como número, no como la cadena
`"2500.00"` que entrega PostgreSQL. Eso confirma que `#formatear` se ejecutó correctamente.

Revisando el cuerpo del método, la razón es clara: **no referencia `this` ni ningún campo
privado internamente**, solo opera sobre su parámetro. La pérdida de contexto es
irrelevante en este caso.

```javascript
#formatear(fila) {
    return { ...fila, costo_estimado: Number(fila.costo_estimado) };
}
```

**Lección:** la IA aplicó una regla general ("no pasar métodos privados por referencia")
sin verificar si aplicaba a este caso concreto. Un falso positivo con etiqueta de "crítico"
es peligroso porque genera confianza inmediata. La evidencia de las pruebas reales pesa más
que el diagnóstico de la herramienta.

Acepté y corregí el hallazgo del req.body.estado: un cuerpo null lanzaba un TypeError no controlado que terminaba en 500. Se resolvió con encadenamiento opcional (req.body?.estado), lo que hace que la petición llegue al validador y devuelva 400.

Se dejo los objetos literales a pesar de que no heredan el error, esto se dejo asi debido a buscar dejarse con una baja complejidad.

Respecto a LSP, se cumple con el principio más no con que el mecanismo haga que sea obligatoria ya que esta fuera del alacance de JS y en caso de querer implementarse deberia ser con TS.

---

## Prompt 3 — Corrección de fuga de información en errores

### Contexto

Durante las pruebas envié un JSON mal formado por error de tipeo y la API respondió con
una página HTML que incluía el stack trace completo:

```
SyntaxError: Expected ',' or '}' after property value in JSON at position 85
    at parse (/home/dolyad/Documentos/Github/.../P1/node_modules/body-parser/lib/types/json.js:96:19)
```

### Prompt enviado

```
Mi API de Express devuelve un stack trace en HTML con las rutas
completas de mi sistema de archivos cuando el cuerpo de la petición
es un JSON inválido.

Mi controlador ya tiene un manejador de errores propio pero no lo
captura.

Explica por qué ocurre y cómo lo corrijo sin exponer información
interna al cliente.
```

### Respuesta obtenida

El error lo lanza el middleware `express.json()` **antes** de que la petición llegue al
controlador, por lo que el método `#manejarError` nunca se entera. Express aplica entonces
su manejador por defecto, que devuelve el stack trace completo.

La solución es un middleware de manejo de errores registrado al final de `app.js` que
detecte el `SyntaxError` del parser.

### Análisis crítico y ajustes aplicados

**Por qué importaba:** el stack trace revelaba la ruta absoluta de mi máquina, mi nombre de
usuario del sistema y el nombre del repositorio. Es información de reconocimiento
aprovechable por un atacante (**A05:2021 – Security Misconfiguration**, OWASP Top 10).

**Ajuste aplicado** en `src/app.js`:

```javascript
// Captura errores lanzados por express.json() cuando el cuerpo no es JSON valido.
// Sin esto, Express responde con un stack trace en HTML que expone rutas internas.
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res
      .status(400)
      .json({ errores: ["El cuerpo de la peticion no es un JSON valido."] });
  }
  console.error(error);
  return res
    .status(500)
    .json({ errores: ["Ocurrio un error interno en el servidor."] });
});
```

**Verificación:** repetí la petición con el JSON roto y ahora devuelve
`{"errores":["El cuerpo de la peticion no es un JSON valido."]}` con código 400, sin
exponer ninguna ruta del sistema.

**Observación:** este hueco no lo detectó la IA al generar el código ni yo al
revisarlo leyéndolo. Apareció únicamente al probar la API con datos inválidos.

---

## Conclusión sobre el uso de IA

- Los prompts que restringen el alcance y prohíben generar código de una vez producen
  diagnósticos verificables; los prompts amplios producen código que funciona pero sin
  garantías sobre su seguridad.
- La IA reportó un problema crítico inexistente. Sin haber probado la API antes, lo habría
  "corregido" sin necesidad. Las pruebas reales son la única forma de distinguir un
  hallazgo válido de un falso positivo.
- Los huecos de seguridad más relevantes aparecieron al probar con datos inválidos, no al
  leer el código.
