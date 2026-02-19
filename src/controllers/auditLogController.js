const { AuditLog, User, Client } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');
const { validationResult } = require('express-validator');

const auditLogController = {
  async getLogs(req, res, next) {
    try {
      const {
        page = 1,
        limit = 50,
        userId,
        action,
        category,
        severity,
        startDate,
        endDate,
        resourceType,
        resourceId,
        success
      } = req.query;

      let query = supabase
        .from('audit_logs')
        .select('*, user:user_id(*)', { count: 'exact' })
        .eq('archived', false)
        .is('deleted_at', null);

      // Access control
      if (req.user.role !== 'admin') {
        query = query.eq('user_id', req.user.id);
      } else if (userId) {
        query = query.eq('user_id', userId);
      }

      if (action) query = query.eq('action', action);
      if (category) query = query.eq('category', category);
      if (severity) query = query.eq('severity', severity);
      if (resourceType) query = query.eq('resource->>type', resourceType);
      if (resourceId) query = query.eq('resource->>id', resourceId);
      if (success !== undefined) query = query.eq('result->>success', success === 'true');

      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);

      query = query.order('created_at', { ascending: false });

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: data || [],
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

  async getLog(req, res, next) {
    try {
      const { logId } = req.params;

      const log = await AuditLog.findById(logId);

      if (!log) {
        return next(new AppError('Audit log not found', 404));
      }

      if (req.user.role !== 'admin' && log.user_id !== req.user.id) {
        return next(new AppError('Access denied', 403));
      }

      // Get related logs
      const { data: relatedLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', log.user_id)
        .neq('id', logId)
        .order('created_at', { ascending: false })
        .limit(10);

      res.json({
        success: true,
        data: {
          log,
          relatedLogs: relatedLogs || []
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async createLog(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const userId = req.user?.id || req.body.context?.userId || null;

      const logData = {
        ...req.body,
        userId: userId,
        metadata: {
          ...req.body.metadata,
          ip: req.ip || req.body.context?.ipAddress,
          userAgent: req.get('User-Agent') || req.body.context?.userAgent,
          apiEndpoint: req.originalUrl,
          httpMethod: req.method
        }
      };

      if (req.sessionID) {
        logData.sessionId = req.sessionID;
      }

      const log = await AuditLog.create(logData);

      res.status(201).json({
        success: true,
        message: 'Audit log created successfully',
        data: log
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserActivity(req, res, next) {
    try {
      const { timeframe = '24h' } = req.query;
      const userId = req.user.role === 'admin' && req.query.userId ? req.query.userId : req.user.id;

      const timeframes = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };

      const since = new Date(Date.now() - (timeframes[timeframe] || timeframes['24h']));

      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', since.toISOString())
        .eq('archived', false);

      if (error) throw new Error(error.message);

      // Calculate stats
      const totalActions = logs?.length || 0;
      let successfulActions = 0;
      let failedActions = 0;
      const categories = {};
      let totalRiskScore = 0;
      const uniqueIPs = new Set();

      (logs || []).forEach(log => {
        if (log.result?.success) successfulActions++;
        else failedActions++;
        categories[log.category] = (categories[log.category] || 0) + 1;
        totalRiskScore += log.risk_score || 0;
        if (log.metadata?.ip) uniqueIPs.add(log.metadata.ip);
      });

      res.json({
        success: true,
        data: {
          totalActions,
          successfulActions,
          failedActions,
          categories: Object.entries(categories).map(([name, count]) => ({ name, count })),
          avgRiskScore: totalActions > 0 ? Math.round(totalRiskScore / totalActions) : 0,
          uniqueIPs: Array.from(uniqueIPs)
        },
        timeframe
      });
    } catch (error) {
      next(error);
    }
  },

  async getSecurityEvents(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      const { startDate, endDate, limit = 100 } = req.query;

      let query = supabase
        .from('audit_logs')
        .select('*')
        .in('category', ['auth', 'security', 'access'])
        .in('severity', ['high', 'critical'])
        .eq('archived', false);

      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: data || [],
        count: data?.length || 0
      });
    } catch (error) {
      next(error);
    }
  },

  async getSuspiciousActivity(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      const { since, limit = 50 } = req.query;

      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('is_suspicious', true)
        .eq('archived', false);

      if (since) query = query.gte('created_at', since);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: data || [],
        count: data?.length || 0
      });
    } catch (error) {
      next(error);
    }
  },

  async getLogsByResource(req, res, next) {
    try {
      const { resourceType, resourceId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      let query = supabase
        .from('audit_logs')
        .select('*, user:user_id(*)', { count: 'exact' })
        .eq('resource->>type', resourceType)
        .eq('resource->>id', resourceId)
        .eq('archived', false)
        .is('deleted_at', null);

      if (req.user.role !== 'admin') {
        query = query.eq('user_id', req.user.id);
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.order('created_at', { ascending: false })
                   .range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: data || [],
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

  async exportLogs(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      const {
        format = 'json',
        startDate,
        endDate,
        userId,
        category,
        severity,
        limit = 1000
      } = req.query;

      let query = supabase
        .from('audit_logs')
        .select('*, user:user_id(name, email)')
        .eq('archived', false)
        .is('deleted_at', null);

      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);
      if (userId) query = query.eq('user_id', userId);
      if (category) query = query.eq('category', category);
      if (severity) query = query.eq('severity', severity);

      const { data: logs, error } = await query
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (error) throw new Error(error.message);

      if (format === 'csv') {
        const csv = (logs || []).map(log => ({
          timestamp: log.created_at,
          user: log.user?.name || 'Unknown',
          action: log.action,
          resource: `${log.resource?.type || 'N/A'}:${log.resource?.id || 'N/A'}`,
          category: log.category,
          severity: log.severity,
          success: log.result?.success,
          ip: log.metadata?.ip,
          userAgent: log.metadata?.userAgent
        }));

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');

        const csvHeader = Object.keys(csv[0] || {}).join(',') + '\n';
        const csvData = csv.map(row => Object.values(row).join(',')).join('\n');

        res.send(csvHeader + csvData);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.json');
        res.json(logs || []);
      }
    } catch (error) {
      next(error);
    }
  },

  async archiveLogs(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      const { startDate, endDate, category, severity } = req.body;

      let query = supabase
        .from('audit_logs')
        .update({ archived: true, archived_at: new Date().toISOString() })
        .eq('archived', false);

      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);
      if (category) query = query.eq('category', category);
      if (severity) query = query.eq('severity', severity);

      const { data, error } = await query.select();

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'Logs archived successfully',
        data: {
          archivedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteExpiredLogs(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      // Delete logs older than retention period (e.g., 1 year)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const { data, error } = await supabase
        .from('audit_logs')
        .delete()
        .lt('created_at', oneYearAgo.toISOString())
        .eq('archived', true)
        .select();

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'Expired logs deleted successfully',
        data: {
          deletedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async anonymizeLog(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      const { logId } = req.params;

      const log = await AuditLog.findById(logId);

      if (!log) {
        return next(new AppError('Audit log not found', 404));
      }

      const updatedLog = await AuditLog.findByIdAndUpdate(logId, {
        user_id: null,
        metadata: {
          ...log.metadata,
          ip: '[ANONYMIZED]',
          userAgent: '[ANONYMIZED]'
        },
        privacy: {
          anonymized: true,
          anonymizedAt: new Date().toISOString()
        }
      });

      res.json({
        success: true,
        message: 'Log anonymized successfully',
        data: {
          logId: updatedLog.id,
          anonymized: true
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getLogStatistics(req, res, next) {
    try {
      if (req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
      }

      const { timeframe = '7d' } = req.query;

      const timeframes = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000
      };

      const since = new Date(Date.now() - (timeframes[timeframe] || timeframes['7d']));

      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', since.toISOString())
        .eq('archived', false)
        .is('deleted_at', null);

      if (error) throw new Error(error.message);

      // Calculate statistics
      const totalLogs = logs?.length || 0;
      let successfulActions = 0;
      let failedActions = 0;
      const categories = {};
      const severities = {};
      const uniqueUsers = new Set();
      const uniqueIPs = new Set();

      (logs || []).forEach(log => {
        if (log.result?.success) successfulActions++;
        else failedActions++;
        categories[log.category] = (categories[log.category] || 0) + 1;
        severities[log.severity] = (severities[log.severity] || 0) + 1;
        if (log.user_id) uniqueUsers.add(log.user_id);
        if (log.metadata?.ip) uniqueIPs.add(log.metadata.ip);
      });

      // Get category breakdown
      const categoryStats = Object.entries(categories)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // Get top actions
      const actionCounts = {};
      (logs || []).forEach(log => {
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
      });
      
      const topActions = Object.entries(actionCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      res.json({
        success: true,
        data: {
          overview: {
            totalLogs,
            successfulActions,
            failedActions,
            successRate: totalLogs > 0 ? Math.round((successfulActions / totalLogs) * 100) : 0,
            uniqueUsersCount: uniqueUsers.size,
            uniqueIPsCount: uniqueIPs.size
          },
          categoryBreakdown: categoryStats,
          severityBreakdown: severities,
          topActions,
          timeframe
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async searchLogs(req, res, next) {
    try {
      const { q, page = 1, limit = 20 } = req.query;

      if (!q || q.trim().length < 3) {
        return next(new AppError('Search query must be at least 3 characters long', 400));
      }

      let query = supabase
        .from('audit_logs')
        .select('*, user:user_id(*)', { count: 'exact' })
        .eq('archived', false)
        .is('deleted_at', null);

      // Search in multiple fields
      query = query.or(`description.ilike.%${q}%,action.ilike.%${q}%,resource->>name.ilike.%${q}%`);

      if (req.user.role !== 'admin') {
        query = query.eq('user_id', req.user.id);
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.order('created_at', { ascending: false })
                   .range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: data || [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil((count || 0) / parseInt(limit)),
          totalItems: count || 0,
          itemsPerPage: parseInt(limit)
        },
        searchQuery: q
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = auditLogController;
