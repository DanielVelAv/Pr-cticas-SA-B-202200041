const { colocarCookie, limpiarCookie } = require("../middlewares/verificarSesion");
const { metrics } = require("@opentelemetry/api");
const { logger } = require("../logger");

// Metricas de negocio (Practica 10): significan algo para quien no es
// ingeniero: cuantas personas entran, cuantas son rechazadas y cuantas
// cuentas nuevas se crean.
const meter = metrics.getMeter("ms-auth");
const iniciosSesion = meter.createCounter("inicios_sesion", {
  description: "Intentos de inicio de sesion por resultado (exitoso, rechazado, error)",
});
const usuariosRegistrados = meter.createCounter("usuarios_registrados", {
  description: "Cuentas de usuario creadas",
});

class AuthController {
  constructor(authService, repositorio) {
    this.authService = authService;
    this.repositorio = repositorio;
  }

  registrar = async (req, res) => {
    try {
      const creado = await this.authService.registrar(req.body);
      usuariosRegistrados.add(1);
      res.status(201).json(creado);
    } catch (e) { this.#error(e, res); }
  };

  login = async (req, res) => {
    try {
      const { token, usuario } = await this.authService.login(req.body);
      iniciosSesion.add(1, { resultado: "exitoso" });
      colocarCookie(res, token);
      // A diferencia de la Practica 2, el token TAMBIEN va en el cuerpo:
      // el API Gateway y los demas microservicios lo necesitan como
      // Bearer, y no todos los clientes son navegadores.
      res.status(200).json({ ...usuario, token });
    } catch (e) {
      iniciosSesion.add(1, { resultado: e.tipo === "NO_AUTENTICADO" ? "rechazado" : "error" });
      this.#error(e, res);
    }
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
    logger.error({ error: error.message, codigo: error.code }, "error interno atendiendo la peticion");
    return res.status(500).json({ errores: ["Error interno del servidor."] });
  }
}

module.exports = AuthController;
