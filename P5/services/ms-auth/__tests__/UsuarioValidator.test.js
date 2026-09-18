const UsuarioValidator = require("../src/validators/UsuarioValidator");

describe("UsuarioValidator.validarRegistro", () => {
  test("rechaza un registro que intenta enviar el campo 'rol' (escalacion de privilegios)", () => {
    const errores = UsuarioValidator.validarRegistro({
      correo: "test@usac.edu.gt",
      nombre: "Prueba Test",
      password: "Segura.12345",
      rol: "admin",
    });
    expect(errores).toContain("El campo rol no puede enviarse en el registro.");
  });

  test("rechaza un correo sin formato valido", () => {
    const errores = UsuarioValidator.validarRegistro({
      correo: "no-es-un-correo",
      nombre: "Prueba Test",
      password: "Segura.12345",
    });
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.some((e) => e.includes("correo"))).toBe(true);
  });

  test("rechaza un nombre de menos de 2 caracteres", () => {
    const errores = UsuarioValidator.validarRegistro({
      correo: "test@usac.edu.gt",
      nombre: "A",
      password: "Segura.12345",
    });
    expect(errores.some((e) => e.includes("nombre"))).toBe(true);
  });

  test("acepta un registro valido sin errores", () => {
    const errores = UsuarioValidator.validarRegistro({
      correo: "valido@usac.edu.gt",
      nombre: "Nombre Valido",
      password: "Segura.12345",
    });
    expect(errores).toEqual([]);
  });

  test("rechaza un cuerpo que no es un objeto (ej. un arreglo)", () => {
    const errores = UsuarioValidator.validarRegistro([]);
    expect(errores.length).toBeGreaterThan(0);
  });
});

describe("UsuarioValidator.validarLogin", () => {
  test("exige correo y password", () => {
    const errores = UsuarioValidator.validarLogin({});
    expect(errores).toContain("El campo correo es obligatorio.");
    expect(errores).toContain("El campo password es obligatorio.");
  });

  test("acepta credenciales con la forma correcta (sin validar que existan en BD)", () => {
    const errores = UsuarioValidator.validarLogin({
      correo: "admin@usac.edu.gt",
      password: "cualquier-cosa",
    });
    expect(errores).toEqual([]);
  });
});
