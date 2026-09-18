const express = require("express");
const config = require("../config/env");

const AesGcmCryptoService = require("../security/AesGcmCryptoService");
const EmailIndexer = require("../security/EmailIndexer");
const BcryptPasswordHasher = require("../security/BcryptPasswordHasher");
const EncryptedPasswordHasher = require("../security/EncryptedPasswordHasher");
const TokenService = require("../security/TokenService");
const PostgresUsuarioRepository = require("../repositories/PostgresUsuarioRepository");
const AuthService = require("../services/AuthService");
const AuthController = require("../controllers/AuthController");
const { crearVerificarSesion } = require("../middlewares/verificarSesion");

// Composition root: unico lugar donde se instancian implementaciones concretas.
const crypto = new AesGcmCryptoService(config.aesKey);
const indexer = new EmailIndexer(config.blindIndexKey);
const hasher = new EncryptedPasswordHasher(new BcryptPasswordHasher(config.bcryptCost), crypto);
const repositorio = new PostgresUsuarioRepository(crypto, indexer);
const tokenService = new TokenService(config.jwt);
const authService = new AuthService(repositorio, hasher, tokenService);
const controlador = new AuthController(authService, repositorio);
const verificarSesion = crearVerificarSesion(tokenService);

const router = express.Router();

router.post("/registro", controlador.registrar);
router.post("/login", controlador.login);
router.post("/logout", verificarSesion, controlador.logout);
router.get("/sesion", verificarSesion, controlador.sesionActual);
router.get("/usuarios", verificarSesion, controlador.listarUsuarios);

module.exports = router;
module.exports.piezas = { repositorio, hasher, tokenService };
