# PROMPTS.md — Práctica 2

Registro de los prompts usados con Claude (Anthropic) durante el desarrollo de este proyecto, en el orden en que ocurrieron. Se incluye el prompt tal como se escribió y una nota breve de qué se decidió o entregó en respuesta, para dejar claro qué fue decisión del estudiante y qué fue ejecución de la IA.

---

## 1. Prompt inicial — arquitectura y forma de trabajo

> "Actúa como un arquitecto de software senior ayudándome a construir, de forma incremental, un módulo de autenticación y autorización full-stack para una práctica universitaria (Software Avanzado - USAC). [...] No escribas todo el código de una vez. Trabajaremos mediante iteraciones. [...] Primer paso — comienza ÚNICAMENTE con esto: Requerimientos funcionales, Requerimientos no funcionales, Casos de uso, Arquitectura propuesta [...] Espera mi aprobación antes de continuar."

**Decisión del estudiante:** fijar el enunciado completo, la rúbrica y la restricción de trabajo iterativo con aprobación en cada paso, antes de que se generara cualquier código.

**Entregado:** requerimientos funcionales/no funcionales, casos de uso, arquitectura PEP/PDP, estructura de carpetas propuesta. Se presentaron preguntas de elicitación (stack, firma del JWT, manejo de contraseña) antes de avanzar.

---

## 2. Confirmación de decisiones de diseño

Respuestas a las preguntas de elicitación:

- Stack: Python/FastAPI + React (decisión posteriormente revertida, ver punto 7)
- Firma del JWT: RS256
- Manejo de contraseña: híbrido `AES(bcrypt(password))`

**Decisión del estudiante:** elegir explícitamente RS256 sobre HS256 y el esquema híbrido de contraseña sobre las otras dos opciones presentadas.

---

## 3. "avanza a la siguiente iteración"

**Entregado:** entidades de dominio, esquema de base de datos, contrato del endpoint `/authorize`, variables de entorno. Sin código de implementación todavía, según lo acordado en el prompt inicial.

---

## 4. "fijemos el retry loop y microservicio de autorizacion"

**Decisión del estudiante:** priorizar esta pieza sobre otras porque concentra el mayor peso de la rúbrica (criterio 1.3).

**Entregado:** microservicio de autorización completo con pruebas, cliente HTTP con clasificación de errores transitorios/de protocolo, y verificación con tokens RS256 reales generados con `openssl`.

---

## 5. "Para la iteración 3, dame la opcion B"

Elección entre dos caminos propuestos por la IA: (A) capa de criptografía primero, o (B) firmador RS256 y `get_current_user` con ventana de gracia primero.

**Decisión del estudiante:** priorizar B para cerrar el circuito de autorización de punta a punta antes de tocar cifrado.

---

## 6. "Realiza la iteración 4"

**Entregado:** capa de criptografía (AES-256-GCM, índice ciego por HMAC, hasher de contraseña), con corrección de un error de diseño propio detectado en la iteración 1 (columna `enc_key_version` separada del blob, corregida para ir dentro del blob cifrado).

---

## 7. "Haz la iteracion 5 con el docker compose el README con el diagrama de secuencia"

**Entregado:** persistencia con SQLAlchemy/Alembic, casos de uso de registro/login/logout, `docker-compose.yml`, y el primer README completo con diagramas Mermaid y los 5 principios SOLID documentados con código citado del proyecto.

---

## 8. Cambio de stack — subida de `P1.rar` y aclaraciones

> "antes de seguir con el frontend, algunas aclaraciones [...] 3 minutos máximo debe ser el tiempo de vida [...] se debe de tomar de base el proyecto 1 [...] No debe ser igual a la practica 1, sino respecto a tecnologías que se usaron, la bd se vuelva a usar, el framework, etc [...] pero siempre apegate a lo que dice el enunciado y la rubrica"

**Decisión del estudiante:** descartar el stack Python/FastAPI construido en las iteraciones 1–5 y reconstruir todo en Node.js/Express/PostgreSQL para mantener continuidad tecnológica con la Práctica 1 propia, además de fijar el TTL máximo en 180 segundos.

**Entregado:** análisis del código de P1 (extraído del `.rar`), backend completo reescrito en el nuevo stack, preservando el diseño (PEP/PDP, retry loop, ventanas del token) pero traduciendo la implementación.

Preguntas de elicitación respondidas por el estudiante en este punto:

- Base de datos: nueva, exclusiva para usuarios (no reutilizar la de solicitudes de P1)
- Rutas protegidas: dos rutas nuevas independientes
- Frontend: React + Vite en proyecto aparte

---

## 9. "ahora dame el frontend con react + vite luego de eso debo probar el codigo... respecto a la documentación..."

**Entregado:** frontend completo (Login, Registro, Confirmación, Perfil, AdminUsuarios, contexto de autenticación), verificado con Playwright contra el backend real, no solo compilado.

---

## 10. "dime como se deberia ver la distribucion de archivos y carpetas, y como debo ejecutar mi proyecto para probarlo?"

**Entregado:** árbol de carpetas completo y guía de ejecución paso a paso.

---

## 11. "en los archivos que me diste, esta unicamente lo necesario para la practica? [...] creo que deberia ser mas simple"

**Decisión del estudiante:** pedir una auditoría explícita del proyecto contra el enunciado y la rúbrica, señalando la sospecha de que había complejidad no justificada.

**Entregado:** tabla de auditoría clasificando cada pieza del proyecto en "exigido por el enunciado", "inevitable por consecuencia técnica" o "extra no pedido", con seis piezas identificadas como extra.

---

## 12. "recortalo sin perder nada de lo que si se menciona en enunciado o rubrica"

**Decisión del estudiante:** autorizar el recorte de las piezas identificadas como extra en el punto anterior.

**Entregado:** eliminación de revocación de sesión (`token_version`), señuelo contra enumeración por tiempo, versionado de llaves AES, AAD por campo, claims `jti`/`tv` del JWT, credencial con cronómetro en el frontend, y la carpeta `pruebas/` del entregable. Verificado de nuevo de punta a punta tras el recorte, incluyendo la corrección de un artefacto de prueba propio (comparación de tokens RS256 firmados en el mismo segundo).

---

## 13. Preguntas de estructura y entrega de archivos

Serie de prompts para aclarar la distribución final de carpetas, corregir una confusión de numeración ("proyecto 1 y 3") y solicitar el listado completo de los 57 archivos del proyecto, más un `.zip` descargable con la estructura completa.

---

## 14. "dime como ejecutar el codigo, que cosas debo cambiar, el .env?? [...] es la primera vez que lo planeo probar"

**Entregado:** guía paso a paso de primera ejecución, con tabla explícita de qué variables de `.env` requieren cambio y cuáles no.

---

## 15. Soporte durante la primera ejecución real

Serie de prompts de depuración conforme el estudiante ejecutaba el proyecto por primera vez en su máquina:

- Confusión de nombre de archivo (`.envb` en vez de `.env`)
- Aclaración sobre cuándo corresponde `cp .env.example .env` y cuándo ya no aplica
- Error `EADDRINUSE` por conflicto de puerto 3000 ya ocupado en la máquina del estudiante — decisión del estudiante de haber usado 3001 en su P1, lo que exigió reasignar el backend principal a 3005
- Error `Failed to fetch` por desincronización entre `VITE_API_URL` y el nuevo puerto

**Nota:** estos ajustes de puerto son específicos del entorno local del estudiante; el `.env.example` del repositorio conserva los valores por defecto (3000/3001) para no confundir a un tercero que clone el proyecto.

---

## 16. Verificación funcional guiada

> "Probar el flujo completo tú mismo, de punta a punta, ahora que ya está corriendo [...] como pruebo esto? [...] como pruebo los otros?"

**Entregado:** instrucciones concretas para verificar manualmente cada uno de los 9 puntos del enunciado (registro, login, las dos rutas por rol, renovación automática, comportamiento ante el microservicio caído), incluyendo cómo acortar temporalmente el TTL para no esperar los 3 minutos reales en cada iteración de prueba.

**Resultado confirmado por el estudiante:** los cinco flujos probados (registro/login/Ruta 2, Ruta 1 con admin, 403 con cliente, renovación automática a los 3 minutos reales, y `503` con el microservicio apagado) funcionaron según lo esperado.

---

## 17. Auditoría final de documentación

> "ahora lo que quiero es que me digas si falta algo en la documenacion?? se menciona algo respecto a los prompts??"

**Entregado:** confirmación de que el README cubre todos los puntos del criterio 2.2 de la rúbrica, y aclaración de que `PROMPTS.md` no es un entregable exigido por el enunciado de esta práctica específica (a diferencia de P1). Se declinó fabricar prompts ficticios cuando se solicitó inicialmente, y se generó en su lugar este documento con el historial real.
