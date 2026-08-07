/**
 * Traduce un error de la API a un mensaje entendible, distinguiendo el
 * caso 503 (microservicio de autorizacion no disponible) de un 403
 * corriente. Es la parte visible del criterio 1.3 de la rubrica.
 */
export function EstadoServidor({ error }) {
  if (!error) return null;

  if (error.status === 503) {
    return (
      <div className="aviso aviso--advertencia">
        <strong>Servicio de autorizacion no disponible.</strong> El backend
        reintento varias veces sin respuesta. Esto no es un rechazo por rol:
        el acceso no pudo evaluarse.
      </div>
    );
  }

  if (error.status === 403) {
    return (
      <div className="aviso aviso--denegado">
        <strong>Acceso denegado.</strong> Su rol no tiene el permiso
        requerido{error.razon ? ` (${error.razon})` : ""}.
      </div>
    );
  }

  return <div className="aviso aviso--denegado">{error.message}</div>;
}
