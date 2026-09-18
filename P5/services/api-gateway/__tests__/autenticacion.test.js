const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

describe("requerirRol", () => {
  const { requerirRol } = require("../src/autenticacion");

  function crearReqResFalsos(rol) {
    const req = { usuario: rol ? { id: "1", rol } : undefined };
    const res = {
      statusCode: null,
      body: null,
      status(codigo) {
        this.statusCode = codigo;
        return this;
      },
      json(cuerpo) {
        this.body = cuerpo;
        return this;
      },
    };
    return { req, res };
  }

  test("permite el paso si el rol coincide", () => {
    const { req, res } = crearReqResFalsos("admin");
    const next = jest.fn();
    requerirRol("admin")(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  test("responde 403 si el rol no coincide", () => {
    const { req, res } = crearReqResFalsos("cliente");
    const next = jest.fn();
    requerirRol("admin")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test("responde 403 si no hay usuario en absoluto en la request", () => {
    const { req, res } = crearReqResFalsos(null);
    const next = jest.fn();
    requerirRol("admin")(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  test("acepta cualquiera de varios roles permitidos", () => {
    const { req, res } = crearReqResFalsos("checker");
    const next = jest.fn();
    requerirRol("admin", "checker", "authorizer")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("verificarToken", () => {
  // Se genera un par de llaves RSA REAL para esta prueba (no un mock):
  // el mismo mecanismo que usa el sistema en produccion, aislado en un
  // archivo temporal para no depender del filesystem real del proyecto.
  let directorioTemporal;
  let llavePrivada;
  let verificarToken;

  beforeAll(() => {
    directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "jwt-test-"));
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    llavePrivada = privateKey;

    fs.writeFileSync(path.join(directorioTemporal, "jwt_public.pem"), publicKey);

    // La ruta se lee como constante al cargar el modulo: hay que fijar
    // la variable de entorno ANTES del primer require.
    process.env.JWT_PUBLIC_KEY_PATH = path.join(directorioTemporal, "jwt_public.pem");
    jest.resetModules();
    ({ verificarToken } = require("../src/autenticacion"));
  });

  function crearReqResFalsos({ headers = {}, cookies = {} } = {}) {
    const req = { headers, cookies };
    const res = {
      statusCode: null,
      body: null,
      status(codigo) {
        this.statusCode = codigo;
        return this;
      },
      json(cuerpo) {
        this.body = cuerpo;
        return this;
      },
    };
    return { req, res };
  }

  test("responde 401 si no viene ningun token", () => {
    const { req, res } = crearReqResFalsos();
    const next = jest.fn();
    verificarToken(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("responde 401 si el token esta firmado con OTRA llave (falsificado)", () => {
    const otroPar = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const tokenFalso = jwt.sign({ sub: "1", rol: "admin" }, otroPar.privateKey, {
      algorithm: "RS256",
    });
    const { req, res } = crearReqResFalsos({
      headers: { authorization: `Bearer ${tokenFalso}` },
    });
    const next = jest.fn();
    verificarToken(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("acepta un token real, firmado con la llave privada correcta", () => {
    const tokenValido = jwt.sign({ sub: "42", rol: "admin" }, llavePrivada, {
      algorithm: "RS256",
      expiresIn: "15m",
    });
    const { req, res } = crearReqResFalsos({
      headers: { authorization: `Bearer ${tokenValido}` },
    });
    const next = jest.fn();
    verificarToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.usuario).toEqual({ id: "42", rol: "admin" });
  });

  test("responde 401 si el token ya expiro", () => {
    const tokenVencido = jwt.sign({ sub: "1", rol: "admin" }, llavePrivada, {
      algorithm: "RS256",
      expiresIn: "-1s",
    });
    const { req, res } = crearReqResFalsos({
      headers: { authorization: `Bearer ${tokenVencido}` },
    });
    const next = jest.fn();
    verificarToken(req, res, next);
    expect(res.statusCode).toBe(401);
  });

  test("tambien acepta el token desde la cookie, si no hay header Authorization", () => {
    const tokenValido = jwt.sign({ sub: "7", rol: "cliente" }, llavePrivada, {
      algorithm: "RS256",
      expiresIn: "15m",
    });
    const { req, res } = crearReqResFalsos({ cookies: { access_token: tokenValido } });
    const next = jest.fn();
    verificarToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.usuario.rol).toBe("cliente");
  });

  afterAll(() => {
    fs.rmSync(directorioTemporal, { recursive: true, force: true });
    delete process.env.JWT_PUBLIC_KEY_PATH;
  });
});
