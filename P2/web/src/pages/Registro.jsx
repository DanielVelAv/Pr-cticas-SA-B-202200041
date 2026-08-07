import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { EstadoServidor } from "../components/EstadoServidor";

export function Registro() {
  const navegar = useNavigate();
  const [form, setForm] = useState({ nombre: "", correo: "", password: "" });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo) => (evento) => setForm({ ...form, [campo]: evento.target.value });

  const enviar = async (evento) => {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.registrar(form);
      navegar("/login", { state: { registrado: true } });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pantalla-centrada">
      <form className="tarjeta tarjeta--formulario" onSubmit={enviar}>
        <p className="eyebrow">Cuenta nueva</p>
        <h1>Crear cuenta</h1>
        <p className="tarjeta__subtitulo">
          Toda cuenta nueva se registra con rol <code>cliente</code>. El rol no
          es un campo del formulario: el servidor lo asigna.
        </p>

        <label className="campo">
          <span>Nombre</span>
          <input value={form.nombre} onChange={cambiar("nombre")} required />
        </label>

        <label className="campo">
          <span>Correo</span>
          <input type="email" value={form.correo} onChange={cambiar("correo")} required />
        </label>

        <label className="campo">
          <span>Contrasena</span>
          <input
            type="password"
            value={form.password}
            onChange={cambiar("password")}
            minLength={8}
            required
          />
          <small>Minimo 8 caracteres.</small>
        </label>

        {error && (
          <div className="aviso aviso--denegado">
            {error.errores?.length ? (
              <ul>
                {error.errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : (
              error.message
            )}
          </div>
        )}

        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? "Creando…" : "Crear cuenta"}
        </button>

        <p className="tarjeta__pie">
          Ya tiene cuenta <Link to="/login">Inicie sesion</Link>
        </p>
      </form>
    </div>
  );
}
