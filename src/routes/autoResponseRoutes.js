const express = require("express");
const { body, param } = require("express-validator");
const {
  getAutoResponses,
  updateAutoResponse,
  resetAutoResponse,
  resetAllAutoResponses,
} = require("../controllers/autoResponseController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.use(protect);

router.get("/", getAutoResponses);

router.put(
  "/",
  body("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating debe estar entre 1 y 5"),
  body("message")
    .notEmpty()
    .withMessage("Message es requerido")
    .isLength({ max: 800 })
    .withMessage("Message no puede exceder 800 caracteres"),
  updateAutoResponse,
);

router.post("/reset/:rating", resetAutoResponse);

router.post("/reset-all", resetAllAutoResponses);

module.exports = router;
