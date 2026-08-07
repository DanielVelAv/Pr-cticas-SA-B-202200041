import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { EstadoServidor } from "../components/EstadoServidor";

// Ruta 2 del enunciado: accesible por admin y cliente.
export function Perfil() {
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .perfil()
      .then((datos) => setPerfil(datos.perfil))
      .catch((err) => setError(err))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="pantalla-centrada">
      <div className="tarjeta">
        <Link className="volver" to="/confirmacion">
          ← Volver
        </Link>
        <p className="eyebrow">Ruta 2 · Admin y cliente</p>
        <h1>Mi perfil</h1>

        {cargando && <p>Cargando…</p>}
        {error && <EstadoServidor error={error} />}

        {perfil && (
          <dl className="lista-datos">
            <div>
              <dt>Nombre</dt>
              <dd>{perfil.nombre}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{perfil.correo}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>
                <span className="etiqueta-rol">{perfil.rol}</span>
              </dd>
            </div>
            <div>
              <dt>Registrado</dt>
              <dd>{new Date(perfil.creadoEn).toLocaleString("es-GT")}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
