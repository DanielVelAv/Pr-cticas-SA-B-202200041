import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { EstadoServidor } from "../components/EstadoServidor";

// Ruta 1 del enunciado: solo admin. Un cliente que llegue aqui por URL
// directa vera el 403 real que devuelve el backend, no una simulacion
// del lado del cliente.
export function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .usuariosAdmin()
      .then((datos) => setUsuarios(datos.usuarios))
      .catch((err) => setError(err))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="pantalla-centrada">
      <div className="tarjeta tarjeta--ancha">
        <Link className="volver" to="/confirmacion">
          ← Volver
        </Link>
        <p className="eyebrow">Ruta 1 · Solo admin</p>
        <h1>Usuarios registrados</h1>

        {cargando && <p>Cargando…</p>}
        {error && <EstadoServidor error={error} />}

        {usuarios && (
          <table className="tabla">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.nombre}</td>
                  <td>{u.correo}</td>
                  <td>
                    <span className="etiqueta-rol">{u.rol}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
