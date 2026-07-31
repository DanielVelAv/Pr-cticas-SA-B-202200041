/**
 * Unica responsabilidad: traducir peticiones HTTP a llamadas del servicio
 * y devolver la respuesta con el codigo de estado correcto.
 */
class SolicitudController {
  constructor(servicio) {
    this.servicio = servicio;
  }

  obtenerTodas = async (req, res) => {
    try {
      const solicitudes = await this.servicio.listarSolicitudes();
      res.status(200).json(solicitudes);
    } catch (error) {
      this.#manejarError(error, res);
    }
  };

  crear = async (req, res) => {
    try {
      const nueva = await this.servicio.registrarSolicitud(req.body);
      res.status(201).json(nueva);
    } catch (error) {
      this.#manejarError(error, res);
    }
  };

  actualizar = async (req, res) => {
    try {
      const actualizada = await this.servicio.actualizarSolicitud(
        req.params.id,
        req.body,
      );
      res.status(200).json(actualizada);
    } catch (error) {
      this.#manejarError(error, res);
    }
  };

  eliminar = async (req, res) => {
    try {
      await this.servicio.eliminarSolicitud(req.params.id);
      res.status(200).json({ mensaje: "Solicitud eliminada correctamente." });
    } catch (error) {
      this.#manejarError(error, res);
    }
  };

  cambiarEstado = async (req, res) => {
    try {
      const actualizada = await this.servicio.cambiarEstado(
        req.params.id,
        req.body?.estado,
      );

      res.status(200).json(actualizada);
    } catch (error) {
      this.#manejarError(error, res);
    }
  };

  // No se expone el detalle interno del error al cliente (buena practica de seguridad).
  #manejarError(error, res) {
    if (error.tipo === "VALIDACION") {
      return res.status(400).json({ errores: error.errores });
    }
    if (error.tipo === "NO_ENCONTRADO") {
      return res.status(404).json({ errores: error.errores });
    }
    console.error(error);
    return res
      .status(500)
      .json({ errores: ["Ocurrio un error interno en el servidor."] });
  }
}

module.exports = SolicitudController;
