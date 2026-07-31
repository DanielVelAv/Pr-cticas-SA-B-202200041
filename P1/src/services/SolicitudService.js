const SolicitudValidator = require('../validators/SolicitudValidator');

/**
 * Contiene la logica de negocio. No sabe nada de Express ni de PostgreSQL:
 * recibe el repositorio ya construido desde afuera (inyeccion de dependencias).
 */
class SolicitudService {

    constructor(repositorio) {
        this.repositorio = repositorio;
    }

    async listarSolicitudes() {
        return await this.repositorio.obtenerTodas();
    }

    async registrarSolicitud(datos) {
        const errores = SolicitudValidator.validarSolicitudCompleta(datos);
        if (errores.length > 0) {
            throw { tipo: 'VALIDACION', errores };
        }
        return await this.repositorio.crear(datos);
    }

    async actualizarSolicitud(id, datos) {
        this.#verificarId(id);

        const errores = SolicitudValidator.validarSolicitudCompleta(datos);
        if (errores.length > 0) {
            throw { tipo: 'VALIDACION', errores };
        }

        const actualizada = await this.repositorio.actualizar(id, datos);
        if (!actualizada) {
            throw { tipo: 'NO_ENCONTRADO', errores: ['No existe una solicitud con ese id.'] };
        }
        return actualizada;
    }

    async eliminarSolicitud(id) {
        this.#verificarId(id);

        const eliminada = await this.repositorio.eliminar(id);
        if (!eliminada) {
            throw { tipo: 'NO_ENCONTRADO', errores: ['No existe una solicitud con ese id.'] };
        }
        return true;
    }

    async cambiarEstado(id, estado) {
        this.#verificarId(id);

        const errores = SolicitudValidator.validarEstado(estado);
        if (errores.length > 0) {
            throw { tipo: 'VALIDACION', errores };
        }

        const actualizada = await this.repositorio.actualizarEstado(id, estado);
        if (!actualizada) {
            throw { tipo: 'NO_ENCONTRADO', errores: ['No existe una solicitud con ese id.'] };
        }
        return actualizada;
    }

    #verificarId(id) {
        const errores = SolicitudValidator.validarId(id);
        if (errores.length > 0) {
            throw { tipo: 'VALIDACION', errores };
        }
    }
}

module.exports = SolicitudService;
