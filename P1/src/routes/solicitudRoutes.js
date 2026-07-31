const express = require('express');
const PostgresSolicitudRepository = require('../repositories/PostgresSolicitudRepository');
const SolicitudService = require('../services/SolicitudService');
const SolicitudController = require('../controllers/SolicitudController');

// Aqui se arman las piezas: repositorio -> servicio -> controlador.
const repositorio = new PostgresSolicitudRepository();
const servicio = new SolicitudService(repositorio);
const controlador = new SolicitudController(servicio);

const router = express.Router();

router.get('/solicitudes', controlador.obtenerTodas);
router.post('/solicitudes', controlador.crear);
router.put('/solicitudes/:id', controlador.actualizar);
router.delete('/solicitudes/:id', controlador.eliminar);
router.patch('/solicitudes/:id/estado', controlador.cambiarEstado);

module.exports = router;
