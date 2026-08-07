import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

/**
 * Fuente unica de verdad sobre quien esta autenticado en el frontend.
 *
 * No guarda el token: el token vive solo en la cookie HttpOnly y este
 * contexto ni siquiera puede leerlo. Solo guarda id, nombre y rol, que
 * es lo que /api/auth/sesion devuelve.
 */
function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      const sesion = await api.sesionActual();
      setUsuario(sesion);
    } catch {
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }, []);

  // Al montar la app, se pregunta al backend si la cookie sigue siendo
  // valida. Es lo que permite recargar la pagina sin perder la sesion.
  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const login = useCallback(async (correo, password) => {
    const datos = await api.login({ correo, password });
    setUsuario(datos);
    return datos;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUsuario(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout, refrescar }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return contexto;
}

export { AuthProvider, useAuth };
