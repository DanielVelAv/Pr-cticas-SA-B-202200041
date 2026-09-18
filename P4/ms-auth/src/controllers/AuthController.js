const { colocarCookie, limpiarCookie } = require("../middlewares/verificarSesion");

class AuthController {
  constructor(authService, repositorio) {
    this.authService = authService;
    this.repositorio = repositorio;
  }

  registrar = async (req, res) => {
    try {
      const creado = await this.authService.registrar(req.body);
      res.status(201).json(creado);
    } catch (e) { this.#error(e, res); }
  };

  login = async (req, res) => {
    try {
      const { token, usuario } = await this.authService.login(req.body);
      colocarCookie(res, token);
      // A diferencia de la Practica 2, el token TAMBIEN va en el cuerpo:
      // el API Gateway y los demas microservicios lo necesitan como
      // Bearer, y no todos los clientes son navegadores.
      res.status(200).json({ ...usuario, token });
    } catch (e) { this.#error(e, res); }
  };

  logout = (req, res) => {
    limpiarCookie(res);
    res.status(204).send();
  };

  sesionActual = async (req, res) => {
    try {
      const u = await this.repositorio.obtenerPorId(req.sesion.usuarioId);
      if (!u) return res.status(401).json({ errores: ["La sesion ya no es valida."] });
      res.status(200).json({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol });
    } catch (e) { this.#error(e, res); }
  };

  listarUsuarios = async (req, res) => {
    try {
      res.status(200).json({ usuarios: await this.repositorio.listarTodos() });
    } catch (e) { this.#error(e, res); }
  };

  #error(error, res) {
    if (error.tipo === "VALIDACION") return res.status(400).json({ errores: error.errores });
    if (error.tipo === "CONFLICTO") return res.status(409).json({ errores: error.errores });
    if (error.tipo === "NO_AUTENTICADO") return res.status(401).json({ errores: error.errores });
    console.error(error);
    return res.status(500).json({ errores: ["Error interno del servidor."] });
  }
}

module.exports = AuthController;
