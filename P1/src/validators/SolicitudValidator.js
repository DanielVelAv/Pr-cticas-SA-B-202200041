const ESTADOS_PERMITIDOS = ["registrada", "en_proceso", "finalizada"];

// Limites tomados directamente del esquema de la base de datos.
const LIMITES = {
  TITULO_MAX: 150, // VARCHAR(150)
  AREA_MAX: 100, // VARCHAR(100)
  COSTO_MAX: 9999999999.99, // NUMERIC(12,2)
};

/**
 * Unica responsabilidad: validar los datos que entran a la API.
 * Para agregar un estado nuevo solo se agrega al arreglo de arriba,
 * sin tocar el servicio ni el controlador.
 */
class SolicitudValidator {
  static validarSolicitudCompleta(datos) {
    // Un cuerpo null o no-objeto rompe el destructuring y produce un 500.
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
      return ["El cuerpo de la peticion debe ser un objeto JSON valido."];
    }

    const errores = [];
    const { titulo, area_solicitante, prioridad, costo_estimado, estado } =
      datos;

    if (!titulo || typeof titulo !== "string" || titulo.trim().length === 0) {
      errores.push("El campo titulo es obligatorio y debe ser texto.");
    } else if (titulo.trim().length > LIMITES.TITULO_MAX) {
      errores.push(
        `El campo titulo no puede exceder ${LIMITES.TITULO_MAX} caracteres.`,
      );
    }

    if (
      !area_solicitante ||
      typeof area_solicitante !== "string" ||
      area_solicitante.trim().length === 0
    ) {
      errores.push(
        "El campo area_solicitante es obligatorio y debe ser texto.",
      );
    } else if (area_solicitante.trim().length > LIMITES.AREA_MAX) {
      errores.push(
        `El campo area_solicitante no puede exceder ${LIMITES.AREA_MAX} caracteres.`,
      );
    }

    if (!Number.isInteger(prioridad) || prioridad < 1 || prioridad > 5) {
      errores.push("El campo prioridad debe ser un entero entre 1 y 5.");
    }

    // Number.isFinite descarta NaN e Infinity en una sola comprobacion.
    if (
      !Number.isFinite(costo_estimado) ||
      costo_estimado < 0 ||
      costo_estimado > LIMITES.COSTO_MAX
    ) {
      errores.push(
        "El campo costo_estimado debe ser un numero entre 0 y 9999999999.99.",
      );
    }

    if (!ESTADOS_PERMITIDOS.includes(estado)) {
      errores.push(
        `El campo estado debe ser uno de: ${ESTADOS_PERMITIDOS.join(", ")}.`,
      );
    }

    return errores;
  }

  static validarEstado(estado) {
    const errores = [];
    if (!ESTADOS_PERMITIDOS.includes(estado)) {
      errores.push(
        `El campo estado debe ser uno de: ${ESTADOS_PERMITIDOS.join(", ")}.`,
      );
    }
    return errores;
  }

  static validarId(id) {
    const errores = [];
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
      errores.push("El id debe ser un numero entero positivo.");
    }
    return errores;
  }
}

module.exports = SolicitudValidator;
