import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Requisito explicito del enunciado (punto 7): pagina de confirmacion
 * visible tras un login exitoso.
 */
export function Confirmacion() {
  const { usuario, logout } = useAuth();
  const navegar = useNavigate();

  const cerrarSesion = async () => {
    await logout();
    navegar("/login", { replace: true });
  };

  if (!usuario) return null;

  return (
    <div className="pantalla-centrada">
      <div className="panel-confirmacion">
        <p className="eyebrow">Sesion iniciada</p>
        <h1>Bienvenido, {usuario.nombre}</h1>
        <p className="panel-confirmacion__texto">
          Autenticacion completada correctamente. Su rol es{" "}
          <span className="etiqueta-rol">{usuario.rol}</span>.
        </p>

        <nav className="accesos">
          <Link className="acceso-tarjeta" to="/admin/usuarios">
            <span className="acceso-tarjeta__numero">Ruta 1</span>
            <span className="acceso-tarjeta__titulo">Usuarios registrados</span>
            <span className="acceso-tarjeta__detalle">Solo admin</span>
          </Link>
          <Link className="acceso-tarjeta" to="/perfil">
            <span className="acceso-tarjeta__numero">Ruta 2</span>
            <span className="acceso-tarjeta__titulo">Mi perfil</span>
            <span className="acceso-tarjeta__detalle">Admin y cliente</span>
          </Link>
        </nav>

        <button className="boton boton--fantasma" onClick={cerrarSesion}>
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}
