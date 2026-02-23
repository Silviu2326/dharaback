const { Webhook } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const axios = require('axios');

const webhookController = {
  async getWebhooks(req, res, next) {
    try {
      const { page = 1, limit = 10, status, event, integrationId } = req.query;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.query.therapistId;

      if (!therapistId) {
        return next(new AppError('Therapist ID is required', 400));
      }

      let query = supabase
        .from('webhooks')
        .select('*', { count: 'exact' })
        .eq('therapist_id', therapistId)
        .eq('is_active', true);

      if (status) query = query.eq('status', status);
      if (event) query = query.contains('events', [event]);
      if (integrationId) query = query.eq('integration_id', integrationId);

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.order('created_at', { ascending: false })
                   .range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      // Remove sensitive fields
      const sanitizedWebhooks = (data || []).map(webhook => ({
        ...webhook,
        secret: undefined,
        authentication: webhook.authentication ? {
          type: webhook.authentication.type,
          // Don't include tokens/passwords/keys
          apiKeyHeader: webhook.authentication.apiKeyHeader
        } : undefined
      }));

      res.json({
        success: true,
        data: sanitizedWebhooks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil((count || 0) / parseInt(limit)),
          totalItems: count || 0,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getWebhook(req, res, next) {
    try {
      const { webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.query.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      res.json({
        success: true,
        data: webhook
      });
    } catch (error) {
      next(error);
    }
  },

  async createWebhook(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const therapistId = req.user.role === 'therapist' ? req.user.id : req.body.therapistId;

      if (!therapistId) {
        return next(new AppError('Therapist ID is required', 400));
      }

      const webhookData = {
        ...req.body,
        therapistId
      };

      if (!webhookData.secret) {
        webhookData.secret = crypto.randomBytes(32).toString('hex');
      }

      const webhook = await Webhook.create(webhookData);

      // Return without sensitive data
      const { secret, ...safeWebhook } = webhook;

      res.status(201).json({
        success: true,
        message: 'Webhook created successfully',
        data: safeWebhook
      });
    } catch (error) {
      next(error);
    }
  },

  async updateWebhook(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.body.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      const allowedUpdates = [
        'name', 'description', 'url', 'method', 'events', 'headers',
        'retry_policy', 'timeout', 'status', 'filters', 'transformation',
        'rate_limit', 'monitoring', 'metadata'
      ];

      const updateData = {};
      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      if (req.body.authentication && req.body.authentication.type !== 'none') {
        updateData.authentication = req.body.authentication;
      }

      const updatedWebhook = await Webhook.findByIdAndUpdate(webhookId, updateData);

      // Return without sensitive data
      const { secret, ...safeWebhook } = updatedWebhook;

      res.json({
        success: true,
        message: 'Webhook updated successfully',
        data: safeWebhook
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteWebhook(req, res, next) {
    try {
      const { webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.query.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      await Webhook.findByIdAndUpdate(webhookId, {
        is_active: false,
        status: 'inactive'
      });

      res.json({
        success: true,
        message: 'Webhook deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  async testWebhook(req, res, next) {
    try {
      const { webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.body.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: { message: 'This is a test webhook delivery' }
      };

      const result = await webhookController.deliverWebhook(webhook, 'webhook.test', testPayload);

      res.json({
        success: true,
        message: 'Test webhook delivered',
        data: {
          deliveryResult: result,
          testPayload
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async deliverWebhook(webhook, event, data) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify(data);

      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
        'X-Webhook-Timestamp': timestamp.toString(),
        'X-Webhook-ID': webhook.id
      };

      if (webhook.signature?.enabled) {
        const signature = crypto
          .createHmac(webhook.signature.algorithm.replace('hmac-', ''), webhook.secret)
          .update(`${timestamp}.${payload}`)
          .digest('hex');
        headers[webhook.signature.header] = `${webhook.signature.algorithm}=${signature}`;
      }

      if (webhook.headers) {
        Object.entries(webhook.headers).forEach(([key, value]) => {
          headers[key] = value;
        });
      }

      if (webhook.authentication?.type !== 'none') {
        switch (webhook.authentication.type) {
          case 'bearer':
            headers['Authorization'] = `Bearer ${webhook.authentication.token}`;
            break;
          case 'basic':
            const credentials = Buffer.from(`${webhook.authentication.username}:${webhook.authentication.password}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
            break;
          case 'api_key':
            headers[webhook.authentication.apiKeyHeader] = webhook.authentication.apiKey;
            break;
          case 'custom':
            if (webhook.authentication.customHeaders) {
              Object.entries(webhook.authentication.customHeaders).forEach(([key, value]) => {
                headers[key] = value;
              });
            }
            break;
        }
      }

      const startTime = Date.now();
      const response = await axios({
        method: webhook.method || 'POST',
        url: webhook.url,
        data: payload,
        headers,
        timeout: webhook.timeout || 30000,
        validateStatus: () => true
      });

      const responseTime = Date.now() - startTime;
      const status = response.status >= 200 && response.status < 300 ? 'success' : 'failed';

      // Record delivery
      const deliveryLog = {
        event,
        payload: data,
        status,
        timestamp: new Date().toISOString(),
        responseTime,
        responseStatus: response.status,
        responseBody: response.data
      };

      // Update webhook with delivery log
      const currentLogs = webhook.delivery_logs || [];
      currentLogs.unshift(deliveryLog);
      
      // Keep only last 100 logs
      if (currentLogs.length > 100) {
        currentLogs.pop();
      }

      await Webhook.findByIdAndUpdate(webhook.id, {
        delivery_logs: currentLogs,
        last_triggered_at: new Date().toISOString(),
        statistics: {
          ...webhook.statistics,
          totalDeliveries: (webhook.statistics?.totalDeliveries || 0) + 1,
          successfulDeliveries: (webhook.statistics?.successfulDeliveries || 0) + (status === 'success' ? 1 : 0),
          failedDeliveries: (webhook.statistics?.failedDeliveries || 0) + (status === 'failed' ? 1 : 0)
        }
      });

      return {
        status,
        responseCode: response.status,
        responseTime,
        delivered: status === 'success'
      };

    } catch (error) {
      throw error;
    }
  },

  async getDeliveryLogs(req, res, next) {
    try {
      const { webhookId } = req.params;
      const { page = 1, limit = 50, status, event } = req.query;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.query.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      let logs = webhook.delivery_logs || [];

      if (status) {
        logs = logs.filter(log => log.status === status);
      }

      if (event) {
        logs = logs.filter(log => log.event === event);
      }

      logs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedLogs = logs.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: paginatedLogs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(logs.length / parseInt(limit)),
          totalItems: logs.length,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getStatistics(req, res, next) {
    try {
      const { webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.query.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      const logs = webhook.delivery_logs || [];
      const recentLogs = logs.filter(log => 
        new Date(log.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

      const eventStats = {};
      logs.forEach(log => {
        if (!eventStats[log.event]) {
          eventStats[log.event] = { total: 0, success: 0, failed: 0 };
        }
        eventStats[log.event].total++;
        if (log.status === 'success') {
          eventStats[log.event].success++;
        } else {
          eventStats[log.event].failed++;
        }
      });

      const stats = webhook.statistics || {};
      const totalDeliveries = stats.totalDeliveries || 0;
      const successfulDeliveries = stats.successfulDeliveries || 0;

      res.json({
        success: true,
        data: {
          overall: stats,
          recent24h: {
            totalDeliveries: recentLogs.length,
            successfulDeliveries: recentLogs.filter(log => log.status === 'success').length,
            failedDeliveries: recentLogs.filter(log => log.status === 'failed').length,
            averageResponseTime: recentLogs.length > 0 
              ? recentLogs.reduce((sum, log) => sum + (log.responseTime || 0), 0) / recentLogs.length 
              : 0
          },
          eventBreakdown: eventStats,
          isHealthy: stats.failedDeliveries < stats.successfulDeliveries,
          successRate: totalDeliveries > 0 ? Math.round((successfulDeliveries / totalDeliveries) * 100) : 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async enableWebhook(req, res, next) {
    try {
      const { webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.body.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      const updatedWebhook = await Webhook.findByIdAndUpdate(webhookId, {
        status: 'active'
      });

      res.json({
        success: true,
        message: 'Webhook enabled successfully',
        data: { status: 'active' }
      });
    } catch (error) {
      next(error);
    }
  },

  async disableWebhook(req, res, next) {
    try {
      const { webhookId } = req.params;
      const { reason } = req.body;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.body.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      const updatedWebhook = await Webhook.findByIdAndUpdate(webhookId, {
        status: 'inactive',
        disabled_reason: reason || 'Manually disabled'
      });

      res.json({
        success: true,
        message: 'Webhook disabled successfully',
        data: { status: 'inactive' }
      });
    } catch (error) {
      next(error);
    }
  },

  async regenerateSecret(req, res, next) {
    try {
      const { webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.body.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      const newSecret = crypto.randomBytes(32).toString('hex');
      
      await Webhook.findByIdAndUpdate(webhookId, {
        secret: newSecret
      });

      res.json({
        success: true,
        message: 'Webhook secret regenerated successfully',
        data: {
          newSecret
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async retryFailedDeliveries(req, res, next) {
    try {
      const { webhookId } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.body.therapistId;

      const webhook = await Webhook.findOne({
        id: webhookId,
        therapistId: therapistId,
        is_active: true
      });

      if (!webhook) {
        return next(new AppError('Webhook not found', 404));
      }

      const failedLogs = (webhook.delivery_logs || []).filter(log =>
        log.status === 'failed' &&
        new Date(log.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

      const retryResults = [];

      for (const log of failedLogs.slice(0, 10)) {
        try {
          const result = await webhookController.deliverWebhook(webhook, log.event, log.payload);
          retryResults.push({
            logId: log.timestamp,
            event: log.event,
            success: true,
            result
          });
        } catch (error) {
          retryResults.push({
            logId: log.timestamp,
            event: log.event,
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: 'Retry completed',
        data: {
          totalRetried: retryResults.length,
          successful: retryResults.filter(r => r.success).length,
          failed: retryResults.filter(r => !r.success).length,
          results: retryResults
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getUnhealthyWebhooks(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      const { data: webhooks, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('is_active', true);

      if (error) throw new Error(error.message);

      const unhealthyWebhooks = (webhooks || []).filter(webhook => {
        const stats = webhook.statistics || {};
        const total = stats.totalDeliveries || 0;
        const failed = stats.failedDeliveries || 0;
        return total > 0 && (failed / total) > 0.5; // More than 50% failure rate
      });

      res.json({
        success: true,
        data: unhealthyWebhooks,
        count: unhealthyWebhooks.length
      });
    } catch (error) {
      next(error);
    }
  },

  async getWebhooksByEvent(req, res, next) {
    try {
      const { event } = req.params;
      const therapistId = req.user.role === 'therapist' ? req.user.id : req.query.therapistId;

      const { data: webhooks, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('therapist_id', therapistId)
        .eq('is_active', true)
        .contains('events', [event]);

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: (webhooks || []).map(webhook => ({
          id: webhook.id,
          name: webhook.name,
          url: webhook.url,
          status: webhook.status,
          successRate: webhook.statistics?.successfulDeliveries / webhook.statistics?.totalDeliveries || 0
        })),
        count: webhooks?.length || 0
      });
    } catch (error) {
      next(error);
    }
  },

  async cleanupOldLogs(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      const { days = 30 } = req.query;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

      const { data: webhooks, error } = await supabase
        .from('webhooks')
        .select('*');

      if (error) throw new Error(error.message);

      let modifiedCount = 0;

      for (const webhook of webhooks || []) {
        const logs = webhook.delivery_logs || [];
        const filteredLogs = logs.filter(log => 
          new Date(log.timestamp) > cutoffDate
        );

        if (filteredLogs.length < logs.length) {
          await Webhook.findByIdAndUpdate(webhook.id, {
            delivery_logs: filteredLogs
          });
          modifiedCount++;
        }
      }

      res.json({
        success: true,
        message: 'Old logs cleaned up successfully',
        data: {
          modifiedCount,
          daysKept: parseInt(days)
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = webhookController;
