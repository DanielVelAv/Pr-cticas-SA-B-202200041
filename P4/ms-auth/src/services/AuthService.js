const UsuarioValidator = require("../validators/UsuarioValidator");

const ROL_POR_DEFECTO = "cliente";

/**
 * Logica de negocio de registro y login.
 *
 * No sabe nada de Express ni de PostgreSQL: recibe el repositorio, el
 * hasher y el servicio de tokens ya construidos desde afuera.
 */
class AuthService {
  #repositorio;
  #hasher;
  #tokenService;

  constructor(repositorio, hasher, tokenService) {
    this.#repositorio = repositorio;
    this.#hasher = hasher;
    this.#tokenService = tokenService;
  }

  async registrar(datos) {
    const errores = UsuarioValidator.validarRegistro(datos);
    if (errores.length > 0) {
      throw { tipo: "VALIDACION", errores };
    }

    const correo = datos.correo.trim();
    if (await this.#repositorio.existePorCorreo(correo)) {
      throw { tipo: "CONFLICTO", errores: ["El correo ya esta registrado."] };
    }

    const creado = await this.#repositorio.crear({
      correo,
      nombre: datos.nombre.trim(),
      passwordSecreto: await this.#hasher.hashear(datos.password),
      // El rol NUNCA viene del cliente. Los admin se crean con el seed.
      rol: ROL_POR_DEFECTO,
    });

    return { id: creado.id, correo: creado.correo, rol: creado.rol };
  }

  async login(datos) {
    const errores = UsuarioValidator.validarLogin(datos);
    if (errores.length > 0) {
      throw { tipo: "VALIDACION", errores };
    }

    const usuario = await this.#repositorio.obtenerPorCorreo(datos.correo);
    if (!usuario) {
      throw this.#credencialesInvalidas();
    }

    const coincide = await this.#hasher.verificar(datos.password, usuario.passwordSecreto);
    if (!coincide) {
      throw this.#credencialesInvalidas();
    }

    return {
      token: this.#tokenService.firmar(usuario.id, usuario.rol),
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    };
  }

  // Mensaje generico a proposito: distinguir "no existe" de "contrasena
  // incorrecta" permite enumerar cuentas registradas.
  #credencialesInvalidas() {
    return { tipo: "NO_AUTENTICADO", errores: ["Credenciales invalidas."] };
  }
}

module.exports = AuthService;
