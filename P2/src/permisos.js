/**
 * Catalogo de permisos.
 *
 * Esta duplicado a proposito en el microservicio de autorizacion: los
 * dos servicios NO comparten codigo, que es lo que los mantiene
 * realmente desacoplados. Si divergen, el microservicio responde
 * PERMISO_DESCONOCIDO en lugar de negar en silencio.
 */
module.exports = Object.freeze({
  USUARIOS_LISTAR: "usuarios:listar", // Ruta 1 - solo admin
  PERFIL_VER: "perfil:ver", // Ruta 2 - admin y cliente
});
