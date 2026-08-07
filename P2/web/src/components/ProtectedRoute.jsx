import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Puerta de las rutas que requieren sesion. No decide permisos por rol
 * -- eso lo hace el backend consultando al microservicio -- solo evita
 * que la SPA muestre una pantalla que de todas formas respondera 401.
 */
export function ProtectedRoute() {
  const { usuario, cargando } = useAuth();

  if (cargando) return <div className="pantalla-carga">Verificando sesion…</div>;
  if (!usuario) return <Navigate to="/login" replace />;

  return <Outlet />;
}
