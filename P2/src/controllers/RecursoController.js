/**
 * Las dos rutas protegidas del enunciado.
 *
 * Ruta 1 lista los usuarios registrados: obliga a descifrar correos y
 * nombres, asi que demuestra el cifrado AES funcionando en un flujo
 * real y no solo en la tabla.
 */
class RecursoController {
  constructor(repositorio) {
    this.repositorio = repositorio;
  }

  // Ruta 1: solo admin
  listarUsuarios = async (req, res) => {
    try {
      const usuarios = await this.repositorio.listarTodos();
      res.status(200).json({
        ruta: "1",
        descripcion: "Listado de usuarios (solo admin)",
        solicitante: req.sesion.rol,
        usuarios,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ errores: ["Ocurrio un error interno en el servidor."] });
    }
  };

  // Ruta 2: admin y cliente
  verPerfil = async (req, res) => {
    try {
      const usuario = await this.repositorio.obtenerPorId(req.sesion.usuarioId);
      if (!usuario) {
        return res.status(401).json({ errores: ["La sesion ya no es valida."] });
      }
      res.status(200).json({
        ruta: "2",
        descripcion: "Perfil propio (admin y cliente)",
        perfil: {
          id: usuario.id,
          nombre: usuario.nombre,
          correo: usuario.correo,
          rol: usuario.rol,
          creadoEn: usuario.creadoEn,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ errores: ["Ocurrio un error interno en el servidor."] });
    }
  };
}

module.exports = RecursoController;
