const express = require("express");
const { body, param } = require("express-validator");
const verificationController = require("../controllers/verificationController");
const { protect, authorize } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const uploadDir = path.join(__dirname, "../../uploads/temp");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const tempStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "temp-degree-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const tempUpload = multer({
  storage: tempStorage,
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

// Configure multer for verification document uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/verification/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "verification-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype =
      /image\/|application\/pdf|application\/msword|application\/vnd|text\//.test(
        file.mimetype,
      );
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Invalid file type."));
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
  param("documentId").isMongoId().withMessage("Document ID must be valid"),
];

// Main routes
router.get("/", verificationController.getVerificationDocuments);
router.get("/documents", verificationController.getVerificationDocuments);
router.post(
  "/upload",
  upload.single("document"),
  uploadValidation,
  verificationController.uploadDocument,
);
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

// Individual document routes
router.get("/:documentId", idValidation, verificationController.getDocument);
router.put(
  "/:documentId",
  idValidation,
  updateValidation,
  verificationController.updateDocument,
);
router.delete(
  "/:documentId",
  idValidation,
  verificationController.deleteDocument,
);
router.get(
  "/:documentId/download",
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
