/**
 * Prueba de carga contra el API Gateway (requisito I).
 *
 * Golpea el sistema con concurrencia CRECIENTE para provocar que el HPA
 * escale, y luego baja la carga para evidenciar el descenso de replicas.
 *
 * Ejecucion:
 *   k6 run scripts/carga/carga.js
 *   k6 run -e BASE_URL=http://sa-p5.local scripts/carga/carga.js
 *
 * Mientras corre, en otras dos terminales:
 *   kubectl get hpa -n sa-p5 -w
 *   kubectl get pods -n sa-p5 -w
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://sa-p5.local';
const CORREO = __ENV.CORREO || 'admin@usac.edu.gt';
const PASSWORD = __ENV.PASSWORD || 'Admin.12345';

// Metricas propias, ademas de las que k6 reporta por defecto
const erroresNegocio = new Rate('errores_negocio');
const latenciaLotes = new Trend('latencia_lotes', true);

export const options = {
  stages: [
    // Rampa progresiva: da tiempo al HPA a reaccionar en cada escalon.
    // El HPA consulta metrics-server cada ~15 s, por eso los tramos
    // duran minutos y no segundos.
    { duration: '1m', target: 10 },   // calentamiento
    { duration: '2m', target: 50 },   // deberia empezar a escalar
    { duration: '2m', target: 100 },  // presion sostenida
    { duration: '2m', target: 150 },  // pico
    { duration: '3m', target: 0 },    // descenso: se observa el scale-down
  ],
  thresholds: {
    // Si se incumplen, k6 termina con codigo distinto de 0.
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.05'],
    errores_negocio: ['rate<0.05'],
  },
};

/**
 * setup() corre UNA vez antes de la prueba. Se autentica aqui para no
 * medir el login en cada iteracion: lo que interesa es la carga sobre
 * los endpoints de negocio.
 */
export function setup() {
  const respuesta = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ correo: CORREO, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (respuesta.status !== 200) {
    throw new Error(`No se pudo autenticar: HTTP ${respuesta.status} ${respuesta.body}`);
  }
  return { token: respuesta.json('token') };
}

export default function (datos) {
  const cabeceras = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${datos.token}`,
    },
  };

  // --- 1. Lectura: es la operacion mas frecuente en un sistema real ---
  const listado = http.get(`${BASE_URL}/api/lotes`, cabeceras);
  latenciaLotes.add(listado.timings.duration);
  const listadoOk = check(listado, {
    'GET /api/lotes responde 200': (r) => r.status === 200,
  });
  erroresNegocio.add(!listadoOk);

  // --- 2. Consulta GraphQL: mas costosa, resuelve campos anidados ---
  const consulta = http.post(
    `${BASE_URL}/api/graphql/lotes`,
    JSON.stringify({ query: '{ lotes { id estado montoTotal } }' }),
    cabeceras
  );
  const graphqlOk = check(consulta, {
    'GraphQL responde 200': (r) => r.status === 200,
    'GraphQL no devuelve errores': (r) => !String(r.body).includes('"errors"'),
  });
  erroresNegocio.add(!graphqlOk);

  // --- 3. Escritura: obliga a trabajar a la base de datos ---
  const escritura = http.post(
    `${BASE_URL}/api/lotes`,
    JSON.stringify({
      nombreArchivo: `carga-${__VU}-${__ITER}.csv`,
      transacciones: [
        {
          cuentaOrigen: '001-100',
          cuentaDestino: '002-200',
          monto: 1200.5,
          beneficiarioNombre: 'Prueba Carga',
          beneficiarioEmail: 'carga@usac.edu.gt',
        },
      ],
    }),
    cabeceras
  );
  const escrituraOk = check(escritura, {
    'POST /api/lotes responde 201': (r) => r.status === 201,
  });
  erroresNegocio.add(!escrituraOk);

  // Pausa breve: sin ella cada usuario virtual satura mas de lo que
  // haria un usuario real, y la medicion pierde sentido.
  sleep(1);
}

/**
 * Imprime el resumen que pide el enunciado: peticiones por segundo,
 * latencia p95 y porcentaje de error. Ademas deja un JSON para adjuntar
 * como evidencia.
 */
export function handleSummary(datos) {
  const m = datos.metrics;
  const rps = m.http_reqs ? m.http_reqs.values.rate.toFixed(2) : 'n/d';
  const p95 = m.http_req_duration ? m.http_req_duration.values['p(95)'].toFixed(2) : 'n/d';
  const errores = m.http_req_failed
    ? (m.http_req_failed.values.rate * 100).toFixed(2)
    : 'n/d';
  const total = m.http_reqs ? m.http_reqs.values.count : 0;

  const texto = `
=====================================================
  RESULTADOS DE LA PRUEBA DE CARGA
=====================================================
  Peticiones totales   : ${total}
  Peticiones por segundo: ${rps} req/s
  Latencia p95          : ${p95} ms
  Porcentaje de error   : ${errores} %
=====================================================
`;

  return {
    stdout: texto,
    'resultados-carga.json': JSON.stringify(datos, null, 2),
  };
}
