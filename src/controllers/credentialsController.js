const { Credentials, User } = require('../models');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs').promises;

// Get credentials with filters and pagination
const getCredentials = async (req, res) => {
  try {
    const {
      type,
      status,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const userId = req.user.id || req.user._id;

    // Build filters
    const filters = { user_id: userId };

    if (type) filters.type = type;
    if (status) filters.status = status;

    // Get credentials with pagination
    const result = await Credentials.paginate({
      page: parseInt(page),
      limit: parseInt(limit),
      filters,
      order: { column: sortBy, ascending: sortOrder === 'asc' }
    });

    res.json({
      success: true,
      data: result.data.map(cred => cred.toJSON()),
      pagination: {
        currentPage: result.pagination.page,
        totalPages: result.pagination.totalPages,
        totalDocs: result.pagination.total,
        hasNextPage: result.pagination.page < result.pagination.totalPages,
        hasPrevPage: result.pagination.page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching credentials',
      error: error.message
    });
  }
};

// Create new credential
const createCredential = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const userId = req.user.id || req.user._id;
    const credentialData = {
      ...req.body,
      userId: userId
    };

    // Handle file upload if present
    if (req.file) {
      credentialData.documentUrl = `/uploads/credentials/${req.file.filename}`;
      credentialData.originalFilename = req.file.originalname;
      credentialData.fileSize = req.file.size;
      credentialData.mimeType = req.file.mimetype;
    }

    const credential = await Credentials.create(credentialData);

    res.status(201).json({
      success: true,
      message: 'Credential created successfully',
      data: credential.toJSON()
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }

    console.error('Error creating credential:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating credential',
      error: error.message
    });
  }
};

// Get single credential
const getCredential = async (req, res) => {
  try {
    const { credentialId } = req.params;

    const credential = await Credentials.findById(credentialId);

    if (!credential) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === 'therapist' && credential.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: credential.toJSON()
    });
  } catch (error) {
    console.error('Error fetching credential:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching credential',
      error: error.message
    });
  }
};

// Update credential
const updateCredential = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { credentialId } = req.params;
    const updates = req.body;

    const credential = await Credentials.findById(credentialId);

    if (!credential) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role !== 'admin' && credential.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Handle file upload if present
    if (req.file) {
      // Delete old file if exists
      if (credential.documentUrl && credential.documentUrl.startsWith('/uploads/')) {
        const oldFilePath = path.join(__dirname, '../../', credential.documentUrl);
        try {
          await fs.unlink(oldFilePath);
        } catch (error) {
          console.error('Error deleting old file:', error);
        }
      }

      updates.documentUrl = `/uploads/credentials/${req.file.filename}`;
      updates.originalFilename = req.file.originalname;
      updates.fileSize = req.file.size;
      updates.mimeType = req.file.mimetype;
    }

    // Apply updates
    const updatedCredential = await Credentials.findByIdAndUpdate(
      credentialId,
      updates,
      { new: true }
    );

    res.json({
      success: true,
      message: 'Credential updated successfully',
      data: updatedCredential.toJSON()
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }

    console.error('Error updating credential:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating credential',
      error: error.message
    });
  }
};

// Delete credential
const deleteCredential = async (req, res) => {
  try {
    const { credentialId } = req.params;

    const credential = await Credentials.findById(credentialId);

    if (!credential) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role !== 'admin' && credential.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete associated file
    if (credential.documentUrl && credential.documentUrl.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../', credential.documentUrl);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    await Credentials.findByIdAndDelete(credentialId);

    res.json({
      success: true,
      message: 'Credential deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting credential',
      error: error.message
    });
  }
};

// Get credentials by user
const getCredentialsByUser = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { type } = req.query;

    const filters = { user_id: userId };
    if (type) filters.type = type;

    const credentials = await Credentials.find({ filters });

    res.json({
      success: true,
      data: credentials.map(cred => cred.toJSON())
    });
  } catch (error) {
    console.error('Error fetching credentials by user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching credentials by user',
      error: error.message
    });
  }
};

// Get API keys
const getApiKeys = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const apiKeys = await Credentials.findApiKeys(userId);

    res.json({
      success: true,
      data: apiKeys.map(key => key.toJSON())
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching API keys',
      error: error.message
    });
  }
};

// Create API key
const createApiKey = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    const apiKey = await Credentials.createApiKey(userId, name, expiresAt);

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        ...apiKey.toJSON(true), // Include value
        warning: 'This is the only time the API key will be shown. Please save it securely.'
      }
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating API key',
      error: error.message
    });
  }
};

// Get expiring credentials
const getExpiringCredentials = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const userId = req.user.id || req.user._id;

    const expiringCredentials = await Credentials.findExpiringSoon(
      parseInt(days),
      userId
    );

    res.json({
      success: true,
      data: expiringCredentials.map(cred => cred.toJSON())
    });
  } catch (error) {
    console.error('Error fetching expiring credentials:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching expiring credentials',
      error: error.message
    });
  }
};

// Get credential statistics
const getCredentialStats = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const stats = await Credentials.getStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching credential stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching credential statistics',
      error: error.message
    });
  }
};

// Download credential document
const downloadDocument = async (req, res) => {
  try {
    const { credentialId } = req.params;

    const credential = await Credentials.findById(credentialId);

    if (!credential) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    const hasAccess =
      req.user.role === 'admin' ||
      credential.userId === userId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!credential.documentUrl) {
      return res.status(404).json({
        success: false,
        message: 'No document associated with this credential'
      });
    }

    const filePath = path.join(__dirname, '../../', credential.documentUrl);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Document file not found on server'
      });
    }

    res.download(filePath, credential.originalFilename || 'credential-document');
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading document',
      error: error.message
    });
  }
};

module.exports = {
  getCredentials,
  createCredential,
  getCredential,
  updateCredential,
  deleteCredential,
  getCredentialsByUser,
  getApiKeys,
  createApiKey,
  getExpiringCredentials,
  getCredentialStats,
  downloadDocument
};
