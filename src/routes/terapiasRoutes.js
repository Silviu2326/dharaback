const express = require("express");
const router = express.Router();
const terapiasController = require("../controllers/terapiasController");

router.get("/", terapiasController.getTerapias);
router.get("/diccionario", terapiasController.getDiccionario);
router.get("/buscar", terapiasController.buscarTerapias);
router.post("/", terapiasController.createTerapia);
router.get("/:id", terapiasController.getTerapiaById);

module.exports = router;
