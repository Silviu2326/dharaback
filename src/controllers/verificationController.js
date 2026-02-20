const { VerificationDocument, User } = require("../models");
const { validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const geminiService = require("../services/geminiService");
const multer = require("multer");

// Get verification documents with filters
const getVerificationDocuments = async (req, res) => {
  try {
    const {
      status,
      type,
      page = 1,
      limit = 20,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    const userId = req.user.id || req.user._id;

    // Build filters
    const filters = {};

    // Allow therapists to see only their documents, admins can see all
    if (req.user.role === "therapist") {
      filters.user_id = userId;
    }

    if (status) filters.status = status;
    if (type) filters.type = type;

    // Get documents with pagination
    const result = await VerificationDocument.paginate({
      page: parseInt(page),
      limit: parseInt(limit),
      filters,
      order: { column: sortBy, ascending: sortOrder === "asc" },
    });

    res.json({
      success: true,
      data: result.data.map((doc) => doc.toJSON()),
      pagination: {
        currentPage: result.pagination.page,
        totalPages: result.pagination.totalPages,
        totalDocs: result.pagination.total,
        hasNextPage: result.pagination.page < result.pagination.totalPages,
        hasPrevPage: result.pagination.page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching verification documents:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching verification documents",
      error: error.message,
    });
  }
};

// Upload verification document
const uploadDocument = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const { name, type, documentNumber, issuingBody, issueDate, expiryDate } =
      req.body;

    const userId = req.user.id || req.user._id;

    // Calculate file checksum
    const fileBuffer = await fs.readFile(req.file.path);
    const checksum = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

    // Check for duplicate documents by checksum
    const existingDoc = await VerificationDocument.findOne({
      user_id: userId,
      checksum,
    });

    if (existingDoc && existingDoc.status !== "rejected") {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        message: "A document with identical content already exists",
        duplicateId: existingDoc.id,
      });
    }

    // Create document record
    const document = await VerificationDocument.create({
      userId: userId,
      type,
      name,
      fileUrl: `/uploads/verification/${req.file.filename}`,
      documentNumber,
      issuingBody,
      issueDate: issueDate || null,
      expiryDate: expiryDate || null,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      data: document.toJSON(),
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error("Error cleaning up file:", unlinkError);
      }
    }

    console.error("Error uploading document:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading document",
      error: error.message,
    });
  }
};

// Get single verification document
const getDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === "therapist" && document.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: document.toJSON(),
    });
  } catch (error) {
    console.error("Error fetching document:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching document",
      error: error.message,
    });
  }
};

// Update document metadata
const updateDocument = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { documentId } = req.params;
    const updates = req.body;

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === "therapist" && document.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Only allow updating certain fields
    const allowedUpdates = [
      "name",
      "documentNumber",
      "issuingBody",
      "issueDate",
      "expiryDate",
    ];
    const filteredUpdates = {};

    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    const updatedDocument = await VerificationDocument.findByIdAndUpdate(
      documentId,
      filteredUpdates,
      { new: true },
    );

    res.json({
      success: true,
      message: "Document updated successfully",
      data: updatedDocument.toJSON(),
    });
  } catch (error) {
    console.error("Error updating document:", error);
    res.status(500).json({
      success: false,
      message: "Error updating document",
      error: error.message,
    });
  }
};

// Review document (admin only)
const reviewDocument = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required.",
      });
    }

    const { documentId } = req.params;
    const { action, comment } = req.body;

    if (!["approve", "reject", "request_changes"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be approve, reject, or request_changes",
      });
    }

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const reviewerId = req.user.id || req.user._id;

    // Perform review action
    switch (action) {
      case "approve":
        await document.approve(reviewerId);
        break;
      case "reject":
        await document.reject(reviewerId, comment);
        break;
      case "request_changes":
        await document.requestChanges(reviewerId, comment);
        break;
    }

    res.json({
      success: true,
      message: `Document ${action}d successfully`,
      data: document.toJSON(),
    });
  } catch (error) {
    console.error("Error reviewing document:", error);
    res.status(500).json({
      success: false,
      message: "Error reviewing document",
      error: error.message,
    });
  }
};

// Download document
const downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === "therapist" && document.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const filePath = path.join(
      __dirname,
      "../../uploads/verification",
      path.basename(document.fileUrl),
    );

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: "File not found on server",
      });
    }

    res.download(filePath, document.name || "document");
  } catch (error) {
    console.error("Error downloading document:", error);
    res.status(500).json({
      success: false,
      message: "Error downloading document",
      error: error.message,
    });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await VerificationDocument.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === "therapist" && document.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Don't allow deletion of approved documents
    if (document.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete approved documents",
      });
    }

    // Delete file from filesystem
    if (document.fileUrl) {
      const filePath = path.join(
        __dirname,
        "../../uploads/verification",
        path.basename(document.fileUrl),
      );
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.error("Error deleting file:", error);
      }
    }

    await VerificationDocument.findByIdAndDelete(documentId);

    res.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting document",
      error: error.message,
    });
  }
};

// Get verification statistics
const getVerificationStats = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const stats = await VerificationDocument.getVerificationStats(
      req.user.role === "therapist" ? userId : null,
    );

    // Get expiring documents
    const expiringDocuments = await VerificationDocument.getExpiringDocuments(
      30,
      {
        userId: req.user.role === "therapist" ? userId : null,
      },
    );

    res.json({
      success: true,
      data: {
        statusCounts: {
          pending: stats.pending || 0,
          approved: stats.approved || 0,
          rejected: stats.rejected || 0,
        },
        completionRate:
          stats.total > 0
            ? Math.round((stats.approved / stats.total) * 100)
            : 0,
        totalDocuments: stats.total,
        expiringCount: expiringDocuments.length,
        expiringDocuments: expiringDocuments
          .slice(0, 5)
          .map((doc) => doc.toJSON()),
      },
    });
  } catch (error) {
    console.error("Error fetching verification stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching verification statistics",
      error: error.message,
    });
  }
};

// Get expiring documents
const getExpiringDocuments = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const userId = req.user.id || req.user._id;

    const expiringDocs = await VerificationDocument.getExpiringDocuments(
      parseInt(days),
      {
        userId: req.user.role === "therapist" ? userId : null,
      },
    );

    res.json({
      success: true,
      data: expiringDocs.map((doc) => doc.toJSON()),
    });
  } catch (error) {
    console.error("Error fetching expiring documents:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching expiring documents",
      error: error.message,
    });
  }
};

// Bulk approve documents (admin only)
const bulkApprove = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required.",
      });
    }

    const { documentIds, comment = "" } = req.body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Document IDs array is required",
      });
    }

    const reviewerId = req.user.id || req.user._id;
    const results = [];

    for (const docId of documentIds) {
      try {
        const document = await VerificationDocument.findById(docId);
        if (document && document.status === "pending") {
          await document.approve(reviewerId);
          results.push({ id: docId, success: true });
        } else {
          results.push({
            id: docId,
            success: false,
            reason: "Document not found or not pending",
          });
        }
      } catch (error) {
        results.push({ id: docId, success: false, reason: error.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    res.json({
      success: true,
      message: `${successCount} documents approved successfully`,
      results,
    });
  } catch (error) {
    console.error("Error bulk approving documents:", error);
    res.status(500).json({
      success: false,
      message: "Error bulk approving documents",
      error: error.message,
    });
  }
};

// Get verification status for current user
const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Get all documents for the therapist
    const documents = await VerificationDocument.find({
      filters: { user_id: userId },
    });

    // Calculate overall status
    let overallStatus = "not_submitted";
    let rejectionFeedback = null;

    if (documents.length > 0) {
      const hasPending = documents.some((d) => d.status === "pending");
      const hasRejected = documents.some((d) => d.status === "rejected");
      const hasApproved = documents.some((d) => d.status === "approved");

      if (hasRejected) {
        overallStatus = "rejected";
        const rejectedDoc = documents.find((d) => d.status === "rejected");
        rejectionFeedback = {
          comment: rejectedDoc.rejectionReason,
          date: rejectedDoc.reviewedAt,
          reviewer: "Verification Team",
        };
      } else if (hasPending) {
        overallStatus = "pending";
      } else if (
        hasApproved &&
        documents.every((d) => d.status === "approved")
      ) {
        overallStatus = "approved";
      } else if (hasApproved) {
        overallStatus = "partially_approved";
      }
    }

    res.json({
      success: true,
      data: {
        overallStatus,
        totalDocuments: documents.length,
        documentsByStatus: {
          pending: documents.filter((d) => d.status === "pending").length,
          approved: documents.filter((d) => d.status === "approved").length,
          rejected: documents.filter((d) => d.status === "rejected").length,
        },
        rejectionFeedback,
        completedRequirements: documents.filter((d) => d.status === "approved")
          .length,
        allRequirementsMet:
          documents.every((d) => d.status === "approved") &&
          documents.length >= 2,
      },
    });
  } catch (error) {
    console.error("Error getting verification status:", error);
    res.status(500).json({
      success: false,
      message: "Error getting verification status",
      error: error.message,
    });
  }
};

// Get verification requirements
const getVerificationRequirements = async (req, res) => {
  try {
    const requirements = [
      {
        id: "education_certificate",
        type: "education_certificate",
        name: "Diploma or Professional Title",
        description: "University degree or valid professional certification",
        required: true,
        order: 1,
      },
      {
        id: "insurance_certificate",
        type: "insurance_certificate",
        name: "Professional Liability Insurance",
        description: "Valid insurance covering professional practice",
        required: true,
        order: 2,
      },
      {
        id: "professional_license",
        type: "professional_license",
        name: "Professional License (optional)",
        description: "Professional license number if applicable",
        required: false,
        order: 3,
      },
    ];

    res.json({
      success: true,
      data: {
        requirements,
      },
    });
  } catch (error) {
    console.error("Error getting verification requirements:", error);
    res.status(500).json({
      success: false,
      message: "Error getting verification requirements",
      error: error.message,
    });
  }
};

const path = require("path");

const analizarTitulacion = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se ha proporcionado ningún documento",
      });
    }

    const { nombre, especialidad, titulacion } = req.body;

    if (!geminiService.isConfigured()) {
      console.warn(
        "⚠️ Gemini no está configurado, usando modo de análisis básico",
      );
      return res.status(200).json({
        success: true,
        data: {
          tempId: req.file.filename,
          originalName: req.file.originalname,
          aiAnalysis: {
            esTitulacionValida: true,
            tipoDocumento: "pendiente_verificacion",
            nombreTitulo: titulacion || null,
            entidadEmisora: null,
            coincideEspecialidad: true,
            camposDetectados: {},
            nivelConfianza: "bajo",
            observaciones:
              "El análisis automático no está disponible. El documento será revisado manualmente por nuestro equipo.",
            recomendacion: "revisar_manualmente",
            analizadoPorAI: false,
          },
        },
      });
    }

    const filePath = path.isAbsolute(req.file.path) 
      ? req.file.path 
      : path.join(__dirname, "../../", req.file.path);
    const fileBuffer = await fs.readFile(filePath);
    const mimeType = req.file.mimetype;

    const aiAnalysis = await geminiService.analyzeDegreeCertificate(
      fileBuffer,
      mimeType,
      {
        nombre,
        especialidad,
        titulacion,
      },
    );

    console.log("✅ Análisis de titulación completado:", {
      esValida: aiAnalysis.esTitulacionValida,
      recomendacion: aiAnalysis.recomendacion,
    });

    res.status(200).json({
      success: true,
      data: {
        tempId: req.file.filename,
        originalName: req.file.originalname,
        aiAnalysis,
      },
    });
  } catch (error) {
    console.error("❌ Error analizando titulación:", error);

    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error("Error limpiando archivo:", unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Error al analizar el documento",
      error: error.message,
    });
  }
};

module.exports = {
  getVerificationDocuments,
  uploadDocument,
  getDocument,
  updateDocument,
  reviewDocument,
  downloadDocument,
  deleteDocument,
  getVerificationStats,
  getExpiringDocuments,
  bulkApprove,
  getVerificationStatus,
  getVerificationRequirements,
  analizarTitulacion,
};
