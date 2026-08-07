const { colocarCookie, limpiarCookie } = require("../middlewares/verificarSesion");

/**
 * Unica responsabilidad: traducir peticiones HTTP a llamadas del
 * servicio y devolver la respuesta con el codigo de estado correcto.
 */
class AuthController {
  constructor(authService, repositorio) {
    this.authService = authService;
    this.repositorio = repositorio;
  }

  registrar = async (req, res) => {
    try {
      const creado = await this.authService.registrar(req.body);
      res.status(201).json(creado);
    } catch (error) {
      this.#manejarError(error, res);
    }
  };

  login = async (req, res) => {
    try {
      const { token, usuario } = await this.authService.login(req.body);
      // El token viaja SOLO en la cookie, nunca en el cuerpo.
      colocarCookie(res, token);
      res.status(200).json(usuario);
    } catch (error) {
      this.#manejarError(error, res);
    }
  };

  // Sin revocacion en el servidor: solo se limpia la cookie del cliente.
  // El token seguiria siendo valido hasta su vencimiento natural
  // (maximo TTL + gracia), lo cual es un plazo corto por diseno.
  logout = (req, res) => {
    limpiarCookie(res);
    res.status(204).send();
  };

  // Permite al frontend rehidratar la sesion tras recargar la pagina.
  sesionActual = async (req, res) => {
    try {
      const usuario = await this.repositorio.obtenerPorId(req.sesion.usuarioId);
      if (!usuario) {
        return res.status(401).json({ errores: ["La sesion ya no es valida."] });
      }
      res.status(200).json({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol });
    } catch (error) {
      this.#manejarError(error, res);
    }
  };

  #manejarError(error, res) {
    if (error.tipo === "VALIDACION") {
      return res.status(400).json({ errores: error.errores });
    }
    if (error.tipo === "CONFLICTO") {
      return res.status(409).json({ errores: error.errores });
    }
    if (error.tipo === "NO_AUTENTICADO") {
      return res.status(401).json({ errores: error.errores });
    }
    console.error(error);
    return res.status(500).json({ errores: ["Ocurrio un error interno en el servidor."] });
  }
}

module.exports = AuthController;
