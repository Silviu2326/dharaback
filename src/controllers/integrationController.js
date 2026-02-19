const Integration = require('../models/Integration');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

const integrationController = {
  async getIntegrations(req, res) {
    try {
      const { page = 1, limit = 10, provider, category, status } = req.query;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.query.therapistId;

      if (!therapistId) {
        return res.status(400).json({
          success: false,
          message: 'Therapist ID is required'
        });
      }

      const query = { therapistId, isActive: true };

      if (provider) query.provider = provider;
      if (category) query.category = category;
      if (status) query.status = status;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 },
        select: '-config.apiKey -config.clientSecret -config.accessToken -config.refreshToken'
      };

      const integrations = await Integration.paginate(query, options);

      res.json({
        success: true,
        data: integrations.docs,
        pagination: {
          currentPage: integrations.page,
          totalPages: integrations.totalPages,
          totalItems: integrations.totalDocs,
          itemsPerPage: integrations.limit
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching integrations',
        error: error.message
      });
    }
  },

  async getIntegration(req, res) {
    try {
      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.query.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      }).select('-config.apiKey -config.clientSecret -config.accessToken -config.refreshToken');

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      res.json({
        success: true,
        data: integration
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching integration',
        error: error.message
      });
    }
  },

  async createIntegration(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const therapistId = req.user.role === 'therapist' ? req.user._id : req.body.therapistId;

      if (!therapistId) {
        return res.status(400).json({
          success: false,
          message: 'Therapist ID is required'
        });
      }

      const existingIntegration = await Integration.findOne({
        therapistId,
        provider: req.body.provider,
        isActive: true
      });

      if (existingIntegration) {
        return res.status(409).json({
          success: false,
          message: 'Integration with this provider already exists'
        });
      }

      const integrationData = {
        ...req.body,
        therapistId
      };

      if (integrationData.config && integrationData.config.webhookUrl) {
        integrationData.webhooks = [{
          event: 'data_sync',
          url: integrationData.config.webhookUrl,
          secret: crypto.randomBytes(32).toString('hex'),
          active: true
        }];
      }

      const integration = new Integration(integrationData);
      await integration.save();

      const responseIntegration = await Integration.findById(integration._id)
        .select('-config.apiKey -config.clientSecret -config.accessToken -config.refreshToken');

      res.status(201).json({
        success: true,
        message: 'Integration created successfully',
        data: responseIntegration
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating integration',
        error: error.message
      });
    }
  },

  async updateIntegration(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.body.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      const allowedUpdates = [
        'name', 'description', 'status', 'syncFrequency', 'autoSync',
        'permissions', 'rateLimits', 'mapping', 'security', 'metadata', 'monitoring'
      ];

      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          integration[field] = req.body[field];
        }
      });

      if (req.body.config) {
        Object.keys(req.body.config).forEach(key => {
          if (key !== 'apiKey' && key !== 'clientSecret' && key !== 'accessToken' && key !== 'refreshToken') {
            integration.config[key] = req.body.config[key];
          }
        });
      }

      await integration.save();

      const responseIntegration = await Integration.findById(integration._id)
        .select('-config.apiKey -config.clientSecret -config.accessToken -config.refreshToken');

      res.json({
        success: true,
        message: 'Integration updated successfully',
        data: responseIntegration
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating integration',
        error: error.message
      });
    }
  },

  async deleteIntegration(req, res) {
    try {
      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.query.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      integration.isActive = false;
      integration.status = 'inactive';
      await integration.save();

      res.json({
        success: true,
        message: 'Integration deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting integration',
        error: error.message
      });
    }
  },

  async connectIntegration(req, res) {
    try {
      const { integrationId } = req.params;
      const { credentials } = req.body;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.body.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      if (credentials.apiKey) {
        integration.config.apiKey = integration.encrypt(credentials.apiKey);
      }
      if (credentials.clientId) {
        integration.config.clientId = credentials.clientId;
      }
      if (credentials.clientSecret) {
        integration.config.clientSecret = integration.encrypt(credentials.clientSecret);
      }
      if (credentials.accessToken) {
        integration.config.accessToken = integration.encrypt(credentials.accessToken);
      }
      if (credentials.refreshToken) {
        integration.config.refreshToken = integration.encrypt(credentials.refreshToken);
      }

      integration.status = 'active';
      integration.security.tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await integration.save();

      const responseIntegration = await Integration.findById(integration._id)
        .select('-config.apiKey -config.clientSecret -config.accessToken -config.refreshToken');

      res.json({
        success: true,
        message: 'Integration connected successfully',
        data: responseIntegration
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error connecting integration',
        error: error.message
      });
    }
  },

  async disconnectIntegration(req, res) {
    try {
      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.query.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      integration.status = 'inactive';
      integration.config.accessToken = undefined;
      integration.config.refreshToken = undefined;
      integration.lastSync = undefined;

      await integration.save();

      res.json({
        success: true,
        message: 'Integration disconnected successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error disconnecting integration',
        error: error.message
      });
    }
  },

  async triggerSync(req, res) {
    try {
      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.body.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      if (integration.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Integration is not active'
        });
      }

      await integration.triggerSync();

      res.json({
        success: true,
        message: 'Sync triggered successfully',
        data: {
          syncStatus: integration.syncStatus,
          lastSync: integration.lastSync
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error triggering sync',
        error: error.message
      });
    }
  },

  async getSyncStatus(req, res) {
    try {
      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.query.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      res.json({
        success: true,
        data: {
          syncStatus: integration.syncStatus,
          lastSync: integration.lastSync,
          nextSyncTime: integration.nextSyncTime,
          isOverdue: integration.isOverdue,
          autoSync: integration.autoSync,
          syncFrequency: integration.syncFrequency
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching sync status',
        error: error.message
      });
    }
  },

  async getUsageStats(req, res) {
    try {
      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.query.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      const rateLimitInfo = integration.checkRateLimit();

      res.json({
        success: true,
        data: {
          usage: integration.usage,
          rateLimits: rateLimitInfo,
          healthStatus: {
            isHealthy: integration.isHealthy,
            errorRate: integration.errorRate,
            lastError: integration.syncStatus.lastError
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching usage stats',
        error: error.message
      });
    }
  },

  async performHealthCheck(req, res) {
    try {
      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.body.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      await integration.performHealthCheck();

      res.json({
        success: true,
        message: 'Health check completed',
        data: {
          isHealthy: integration.isHealthy,
          healthCheck: integration.monitoring.healthCheck,
          status: integration.status
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error performing health check',
        error: error.message
      });
    }
  },

  async getWebhooks(req, res) {
    try {
      const { integrationId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.query.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      }).select('webhooks');

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      res.json({
        success: true,
        data: integration.webhooks.map(webhook => ({
          ...webhook.toObject(),
          secret: undefined
        }))
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching webhooks',
        error: error.message
      });
    }
  },

  async addWebhook(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { integrationId } = req.params;
      const { event, url } = req.body;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.body.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      const webhook = {
        event,
        url,
        secret: integration.generateWebhookSecret(),
        active: true
      };

      integration.webhooks.push(webhook);
      await integration.save();

      res.status(201).json({
        success: true,
        message: 'Webhook added successfully',
        data: {
          ...webhook,
          secret: undefined
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error adding webhook',
        error: error.message
      });
    }
  },

  async removeWebhook(req, res) {
    try {
      const { integrationId, webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user._id : req.query.therapistId;

      const integration = await Integration.findOne({
        _id: integrationId,
        therapistId,
        isActive: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      integration.webhooks = integration.webhooks.filter(
        webhook => webhook._id.toString() !== webhookId
      );

      await integration.save();

      res.json({
        success: true,
        message: 'Webhook removed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error removing webhook',
        error: error.message
      });
    }
  },

  async getProviderStats(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const stats = await Integration.getProviderStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching provider stats',
        error: error.message
      });
    }
  },

  async getOverdueSyncs(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const overdueIntegrations = await Integration.findOverdueSync();

      res.json({
        success: true,
        data: overdueIntegrations,
        count: overdueIntegrations.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching overdue syncs',
        error: error.message
      });
    }
  }
};

module.exports = integrationController;