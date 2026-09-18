const { buildSchema } = require("graphql");
const repositorio = require("./repositorio");

/**
 * Esquema GraphQL de ms-lotes.
 *
 * GraphQL se eligio aqui porque el consumidor tipico de un lote necesita
 * datos anidados de profundidad variable: a veces solo el encabezado del
 * lote, a veces el lote con todas sus transacciones. Con REST harian
 * falta dos endpoints distintos o un parametro de expansion; con GraphQL
 * el cliente pide exactamente los campos que va a usar.
 */
const schema = buildSchema(`
  type Transaccion {
    id: Int!
    cuentaOrigen: String!
    cuentaDestino: String!
    monto: Float!
    beneficiarioNombre: String!
    beneficiarioEmail: String!
    valida: Boolean!
    motivoRechazo: String
  }

  type Lote {
    id: Int!
    nombreArchivo: String!
    estado: String!
    totalTransacciones: Int!
    montoTotal: Float!
    usuarioId: String!
    creadoEn: String!
    transacciones: [Transaccion!]!
  }

  input TransaccionInput {
    cuentaOrigen: String!
    cuentaDestino: String!
    monto: Float!
    beneficiarioNombre: String!
    beneficiarioEmail: String!
  }

  type Query {
    lotes: [Lote!]!
    lote(id: Int!): Lote
  }

  type Mutation {
    crearLote(nombreArchivo: String!, usuarioId: String!, transacciones: [TransaccionInput!]!): Lote!
    cambiarEstado(id: Int!, estado: String!): Lote
  }
`);

const aTransaccion = (f) => ({
  id: f.id,
  cuentaOrigen: f.cuenta_origen,
  cuentaDestino: f.cuenta_destino,
  monto: Number(f.monto),
  beneficiarioNombre: f.beneficiario_nombre,
  beneficiarioEmail: f.beneficiario_email,
  valida: f.valida,
  motivoRechazo: f.motivo_rechazo,
});

// Las transacciones se resuelven de forma perezosa: solo se consultan
// si el cliente las pidio en la query.
const aLote = (f) => ({
  id: f.id,
  nombreArchivo: f.nombre_archivo,
  estado: f.estado,
  totalTransacciones: f.total_transacciones,
  montoTotal: Number(f.monto_total),
  usuarioId: f.usuario_id,
  creadoEn: new Date(f.creado_en).toISOString(),
  transacciones: async () => (await repositorio.transaccionesDe(f.id)).map(aTransaccion),
});

const root = {
  lotes: async () => (await repositorio.listarLotes()).map(aLote),
  lote: async ({ id }) => {
    const l = await repositorio.obtenerLote(id);
    return l ? aLote(l) : null;
  },
  crearLote: async ({ nombreArchivo, usuarioId, transacciones }) => {
    if (!transacciones.length) throw new Error("El lote debe traer al menos una transaccion");
    return aLote(await repositorio.crearLote({ nombreArchivo, usuarioId, transacciones }));
  },
  cambiarEstado: async ({ id, estado }) => {
    const l = await repositorio.cambiarEstado(id, estado);
    return l ? aLote(l) : null;
  },
};

module.exports = { schema, root };
