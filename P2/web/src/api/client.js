const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

/**
 * Envoltorio unico sobre fetch.
 *
 * credentials: "include" es lo que hace que el navegador envie la
 * cookie HttpOnly en cada peticion. Sin esto, la sesion nunca viajaria
 * y todo respondería 401 pese a estar "logueado".
 */
async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opciones.headers },
    ...opciones,
  });

  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // 204 No Content no trae cuerpo; no es un error.
  }

  if (!respuesta.ok) {
    const error = new Error(cuerpo?.errores?.[0] || `Error ${respuesta.status}`);
    error.status = respuesta.status;
    error.errores = cuerpo?.errores || [];
    error.razon = cuerpo?.razon;
    throw error;
  }

  return cuerpo;
}

export const api = {
  registrar: (datos) => pedir("/auth/registro", { method: "POST", body: JSON.stringify(datos) }),
  login: (datos) => pedir("/auth/login", { method: "POST", body: JSON.stringify(datos) }),
  logout: () => pedir("/auth/logout", { method: "POST" }),
  sesionActual: () => pedir("/auth/sesion"),
  perfil: () => pedir("/perfil"),
  usuariosAdmin: () => pedir("/admin/usuarios"),
};
