const express = require("express");
const { body, param } = require("express-validator");
const verificationController = require("../controllers/verificationController");
const { protect, authorize } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Configuración de multer para análisis de titulación (memory storage para subir a Supabase)
const tempUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedExtensions = /jpeg|jpg|png|gif|webp|pdf/;
    const allowedMimeTypes = /image\/(jpeg|png|gif|webp)|application\/pdf/;
    const extname = allowedExtensions.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedMimeTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Solo se permiten imágenes (JPEG, PNG, GIF, WebP) o PDFs"));
  },
});

router.post(
  "/analizar-titulacion",
  tempUpload.single("document"),
  verificationController.analizarTitulacion,
);

router.use(protect);

// Configure multer for verification document uploads (memory storage → Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: function (req, file, cb) {
    const allowed = /jpeg|jpg|png|pdf/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /image\/(jpeg|jpg|png)|application\/pdf/.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Tipo de archivo no válido. Solo PDF, JPG, PNG."));
  },
});

// Validation rules
const uploadValidation = [
  body("name")
    .notEmpty()
    .withMessage("Document name is required")
    .isLength({ max: 200 }),
  body("type").isIn([
    "diploma",
    "license",
    "insurance",
    "certificate",
    "id_card",
    "cv",
    "recommendation",
    "other",
  ]),
  body("documentNumber").optional().isLength({ max: 100 }),
  body("issuingAuthority").optional().isLength({ max: 200 }),
  body("issueDate").optional().isISO8601(),
  body("expiryDate").optional().isISO8601(),
  body("priority").optional().isIn(["low", "medium", "high", "critical"]),
  body("verificationLevel").optional().isIn(["basic", "standard", "enhanced"]),
];

const updateValidation = [
  body("name").optional().isLength({ max: 200 }),
  body("documentNumber").optional().isLength({ max: 100 }),
  body("issuingAuthority").optional().isLength({ max: 200 }),
  body("issueDate").optional().isISO8601(),
  body("expiryDate").optional().isISO8601(),
  body("priority").optional().isIn(["low", "medium", "high", "critical"]),
];

const reviewValidation = [
  body("action")
    .isIn(["approve", "reject", "request_changes"])
    .withMessage("Invalid review action"),
  body("comment").optional().isLength({ max: 1000 }),
];

const bulkValidation = [
  body("documentIds")
    .isArray({ min: 1 })
    .withMessage("Document IDs must be a non-empty array"),
  body("documentIds.*").isMongoId().withMessage("Each document ID must be valid"),
  body("comment").optional().isLength({ max: 1000 }),
];

const idValidation = [
  param("documentId").isUUID().withMessage("Document ID must be a valid UUID"),
];

// Main routes
router.get("/", verificationController.getVerificationDocuments);
router.get("/documents", verificationController.getVerificationDocuments);
router.post(
  "/documents",
  upload.single("document"),
  verificationController.uploadDocument,
);
router.post(
  "/upload",
  upload.single("document"),
  uploadValidation,
  verificationController.uploadDocument,
);
router.post("/submit", verificationController.submitVerification);
router.get("/stats", verificationController.getVerificationStats);
router.get("/expiring", verificationController.getExpiringDocuments);

// Status and requirements routes
router.get("/status", verificationController.getVerificationStatus);
router.get("/status/detailed", verificationController.getVerificationStatus);
router.get("/requirements", verificationController.getVerificationRequirements);
router.get(
  "/requirements/checklist",
  verificationController.getVerificationRequirements,
);
router.get(
  "/requirements/check",
  verificationController.getVerificationRequirements,
);

// Timeline route (must be before /:documentId)
router.get("/timeline", verificationController.getVerificationTimeline);

// Individual document routes
router.get("/documents/:documentId", idValidation, verificationController.getDocument);
router.put(
  "/documents/:documentId",
  idValidation,
  updateValidation,
  verificationController.updateDocument,
);
router.delete(
  "/documents/:documentId",
  idValidation,
  verificationController.deleteDocument,
);
router.get(
  "/documents/:documentId/download",
  idValidation,
  verificationController.downloadDocument,
);

// Workflow routes (admin only)
router.post(
  "/:documentId/review",
  idValidation,
  reviewValidation,
  authorize(["admin"]),
  verificationController.reviewDocument,
);

// Bulk operations (admin only)
router.post(
  "/bulk/approve",
  bulkValidation,
  authorize(["admin"]),
  verificationController.bulkApprove,
);

module.exports = router;
