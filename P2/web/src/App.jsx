import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Registro } from "./pages/Registro";
import { Confirmacion } from "./pages/Confirmacion";
import { Perfil } from "./pages/Perfil";
import { AdminUsuarios } from "./pages/AdminUsuarios";

function Raiz() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div className="pantalla-carga">Verificando sesion…</div>;
  return <Navigate to={usuario ? "/confirmacion" : "/login"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Raiz />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Registro />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/confirmacion" element={<Confirmacion />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/admin/usuarios" element={<AdminUsuarios />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
