const express = require("express");
const router = express.Router();
const { getPendingDocuments, approveDocument } = require("../controllers/adminVerificationController");

router.get("/pending-documents", getPendingDocuments);
router.patch("/approve/:id", approveDocument);

module.exports = router;
