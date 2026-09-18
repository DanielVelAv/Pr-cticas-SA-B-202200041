const { validar } = require("../src/repositorio");

describe("validar() — reglas de negocio de una transaccion", () => {
  const base = {
    cuentaOrigen: "GT001-0001",
    cuentaDestino: "GT001-0002",
    monto: 100,
    beneficiarioEmail: "beneficiario@usac.edu.gt",
  };

  test("acepta una transaccion valida", () => {
    expect(validar(base)).toBeNull();
  });

  test("rechaza si falta la cuenta origen", () => {
    const t = { ...base, cuentaOrigen: undefined };
    expect(validar(t)).toBe("Cuenta origen o destino ausente");
  });

  test("rechaza si falta la cuenta destino", () => {
    const t = { ...base, cuentaDestino: undefined };
    expect(validar(t)).toBe("Cuenta origen o destino ausente");
  });

  test("rechaza si la cuenta origen y destino son iguales", () => {
    const t = { ...base, cuentaDestino: base.cuentaOrigen };
    expect(validar(t)).toBe("Cuenta origen y destino son iguales");
  });

  test("rechaza un monto de cero", () => {
    const t = { ...base, monto: 0 };
    expect(validar(t)).toBe("El monto debe ser mayor a cero");
  });

  test("rechaza un monto negativo", () => {
    const t = { ...base, monto: -50 };
    expect(validar(t)).toBe("El monto debe ser mayor a cero");
  });

  test("rechaza un monto que excede el limite de 50000", () => {
    const t = { ...base, monto: 50001 };
    expect(validar(t)).toBe("El monto excede el limite de 50000");
  });

  test("acepta un monto exactamente en el limite (50000)", () => {
    const t = { ...base, monto: 50000 };
    expect(validar(t)).toBeNull();
  });

  test("rechaza un correo de beneficiario invalido", () => {
    const t = { ...base, beneficiarioEmail: "no-es-correo" };
    expect(validar(t)).toBe("Correo del beneficiario invalido");
  });

  test("rechaza si el correo del beneficiario esta ausente", () => {
    const t = { ...base, beneficiarioEmail: undefined };
    expect(validar(t)).toBe("Correo del beneficiario invalido");
  });
});
