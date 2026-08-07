import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { EstadoServidor } from "../components/EstadoServidor";

export function Login() {
  const { login } = useAuth();
  const navegar = useNavigate();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(correo, password);
      navegar("/confirmacion", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pantalla-centrada">
      <form className="tarjeta tarjeta--formulario" onSubmit={enviar}>
        <p className="eyebrow">Sesion</p>
        <h1>Iniciar sesion</h1>
        <p className="tarjeta__subtitulo">
          Acceda con la cuenta registrada. El token vive en una cookie de solo
          servidor: JavaScript no puede leerlo.
        </p>

        <label className="campo">
          <span>Correo</span>
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="campo">
          <span>Contrasena</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <EstadoServidor error={error} />}

        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? "Verificando…" : "Ingresar"}
        </button>

        <p className="tarjeta__pie">
          No tiene cuenta <Link to="/registro">Registrese aqui</Link>
        </p>

        <details className="credenciales-demo">
          <summary>Usuarios de demostracion</summary>
          <code>admin@usac.edu.gt / Admin.12345</code>
          <code>cliente@usac.edu.gt / Cliente.12345</code>
        </details>
      </form>
    </div>
  );
}
