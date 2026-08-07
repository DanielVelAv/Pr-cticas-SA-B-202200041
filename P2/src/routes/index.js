const express = require("express");
const config = require("../config/env");

const AesGcmCryptoService = require("../security/AesGcmCryptoService");
const EmailIndexer = require("../security/EmailIndexer");
const BcryptPasswordHasher = require("../security/BcryptPasswordHasher");
const EncryptedPasswordHasher = require("../security/EncryptedPasswordHasher");
const TokenService = require("../security/TokenService");
const RetryPolicy = require("../security/RetryPolicy");
const HttpAuthorizationClient = require("../security/HttpAuthorizationClient");

const PostgresUsuarioRepository = require("../repositories/PostgresUsuarioRepository");
const AuthService = require("../services/AuthService");
const SesionService = require("../services/SesionService");
const AuthController = require("../controllers/AuthController");
const RecursoController = require("../controllers/RecursoController");
const { crearVerificarSesion } = require("../middlewares/verificarSesion");
const crearRequerirPermiso = require("../middlewares/requerirPermiso");
const PERMISOS = require("../permisos");

/**
 * Aqui se arman todas las piezas. Es el UNICO lugar donde se instancian
 * implementaciones concretas: todo lo demas depende de contratos.
 *
 *   cripto -> repositorio -> servicio -> controlador
 *   politica de reintentos -> cliente HTTP -> middleware de permisos
 */

const crypto = new AesGcmCryptoService(config.aesKey);
const indexer = new EmailIndexer(config.blindIndexKey);
const hasher = new EncryptedPasswordHasher(
  new BcryptPasswordHasher(config.bcryptCost),
  crypto,
);

const repositorio = new PostgresUsuarioRepository(crypto, indexer);
const tokenService = new TokenService(config.jwt);

const retryPolicy = new RetryPolicy({
  maxReintentos: config.authz.maxReintentos,
  baseMs: config.authz.backoffBaseMs,
  maxMs: config.authz.backoffMaxMs,
});
const authorizationClient = new HttpAuthorizationClient({
  baseUrl: config.authz.url,
  timeoutMs: config.authz.timeoutMs,
  retryPolicy,
});

const sesionService = new SesionService(tokenService, config.jwt.graciaSegundos);
const verificarSesion = crearVerificarSesion(sesionService);
const requerirPermiso = crearRequerirPermiso(authorizationClient);

const authService = new AuthService(repositorio, hasher, tokenService);
const authController = new AuthController(authService, repositorio);
const recursoController = new RecursoController(repositorio);

const router = express.Router();

// --- Rutas publicas ---
router.post("/auth/registro", authController.registrar);
router.post("/auth/login", authController.login);

// --- Rutas que solo requieren sesion ---
router.post("/auth/logout", verificarSesion, authController.logout);
router.get("/auth/sesion", verificarSesion, authController.sesionActual);

// --- Las dos rutas protegidas por rol (requisito 8) ---
router.get(
  "/admin/usuarios",
  verificarSesion,
  requerirPermiso(PERMISOS.USUARIOS_LISTAR),
  recursoController.listarUsuarios,
);
router.get(
  "/perfil",
  verificarSesion,
  requerirPermiso(PERMISOS.PERFIL_VER),
  recursoController.verPerfil,
);

module.exports = router;
