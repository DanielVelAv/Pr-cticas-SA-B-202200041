/**
 * Politica de acceso: unica fuente de verdad de que puede hacer cada rol.
 *
 * Este catalogo esta duplicado respecto al del backend principal. Es
 * deliberado: los dos servicios no comparten codigo, que es lo que los
 * mantiene realmente desacoplados.
 */
const PERMISOS_POR_ROL = Object.freeze({
  admin: ["usuarios:listar", "perfil:ver"],
  cliente: ["perfil:ver"],
});

/**
 * Contrato de consulta de politica. Sustituirlo por una version
 * respaldada en base de datos no exige tocar el caso de uso.
 */
class PolicyRepository {
  permisosDe(rol) {
    throw new Error("Metodo no implementado");
  }

  existePermiso(permiso) {
    throw new Error("Metodo no implementado");
  }
}

class PoliticaEnMemoria extends PolicyRepository {
  #tabla;

  constructor(tabla = PERMISOS_POR_ROL) {
    super();
    this.#tabla = tabla;
  }

  permisosDe(rol) {
    return this.#tabla[rol] ?? [];
  }

  existePermiso(permiso) {
    return Object.values(this.#tabla).some((lista) => lista.includes(permiso));
  }
}

module.exports = { PolicyRepository, PoliticaEnMemoria, PERMISOS_POR_ROL };
