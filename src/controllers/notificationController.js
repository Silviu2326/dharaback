const { validationResult } = require('express-validator');
const { Notification, User, Client } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const notificationController = {
  // Get all notifications for a user
  async getNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        page = 1,
        limit = 20,
        type,
        priority,
        isRead,
        includeArchived = false
      } = req.query;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        type,
        priority,
        read: isRead !== undefined ? isRead === 'true' : undefined,
        includeExpired: includeArchived === 'true'
      };

      const result = await Notification.paginate(userId, options);

      res.json({
        success: true,
        data: {
          notifications: result.data.map(n => n.toJSON()),
          pagination: {
            current: result.page,
            pages: result.totalPages,
            total: result.total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get a specific notification
  async getNotification(req, res, next) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: userId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      // Mark as read if not already read
      if (!notification.isRead) {
        await notification.markAsRead();
      }

      res.json({
        success: true,
        data: notification.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Create a new notification
  async createNotification(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const {
        userId,
        type,
        title,
        message,
        data = {},
        priority = 'medium',
        actionUrl,
        expiresAt
      } = req.body;

      // Verify user exists
      const user = await User.findById(userId);
      if (!user) {
        return next(new AppError('User not found', 404));
      }

      const notificationData = {
        userId,
        type,
        title,
        message,
        data,
        priority,
        actionUrl,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      };

      const notification = await Notification.create(notificationData);

      res.status(201).json({
        success: true,
        data: notification.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark notification as read
  async markAsRead(req, res, next) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: userId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      await notification.markAsRead();

      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark all notifications as read
  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const { type } = req.query;

      let query = supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'All notifications marked as read',
        data: {
          modifiedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Dismiss notification
  async dismissNotification(req, res, next) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: userId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      // Set expiration to now (dismiss)
      await Notification.findByIdAndUpdate(notificationId, {
        expiresAt: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Notification dismissed'
      });
    } catch (error) {
      next(error);
    }
  },

  // Archive notification
  async archiveNotification(req, res, next) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: userId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      await notification.archive();

      res.json({
        success: true,
        message: 'Notification archived'
      });
    } catch (error) {
      next(error);
    }
  },

  // Track notification click
  async trackClick(req, res, next) {
    try {
      const { notificationId } = req.params;
      const { metadata = {} } = req.body;
      const userId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: userId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      // Track click in metadata
      const clicks = notification.data?.clicks || [];
      clicks.push({
        timestamp: new Date().toISOString(),
        ...metadata
      });

      await Notification.findByIdAndUpdate(notificationId, {
        data: { ...notification.data, clicks }
      });

      res.json({
        success: true,
        message: 'Click tracked successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get notification counts
  async getNotificationCounts(req, res, next) {
    try {
      const userId = req.user.id;

      const stats = await Notification.getStats(userId);

      res.json({
        success: true,
        data: stats || {
          total: 0,
          unread: 0,
          urgent: 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get notifications by type
  async getNotificationsByType(req, res, next) {
    try {
      const userId = req.user.id;
      const { type } = req.params;

      const notifications = await Notification.findByType(userId, type, {
        limit: 50
      });

      res.json({
        success: true,
        data: notifications.map(n => n.toJSON())
      });
    } catch (error) {
      next(error);
    }
  },

  // Get notification analytics
  async getNotificationAnalytics(req, res, next) {
    try {
      const userId = req.user.id;
      const { period = 'week' } = req.query;

      // Get date range
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      // Get notifications in date range
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', now.toISOString());

      if (error) throw new Error(error.message);

      const notifs = (notifications || []).map(n => new Notification.Notification(n));

      // Calculate analytics
      const totalNotifications = notifs.length;
      const unreadCount = notifs.filter(n => !n.isRead).length;
      
      // Type distribution
      const typeDistribution = notifs.reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {});

      // Priority distribution
      const priorityDistribution = notifs.reduce((acc, n) => {
        acc[n.priority] = (acc[n.priority] || 0) + 1;
        return acc;
      }, {});

      // Read rate
      const readRate = totalNotifications > 0 
        ? (totalNotifications - unreadCount) / totalNotifications 
        : 0;

      // Average response time (for read notifications)
      const readNotifications = notifs.filter(n => n.isRead && n.readAt);
      let averageResponseTime = 0;
      if (readNotifications.length > 0) {
        const totalResponseTime = readNotifications.reduce((sum, n) => {
          return sum + (new Date(n.readAt) - new Date(n.createdAt));
        }, 0);
        averageResponseTime = totalResponseTime / readNotifications.length;
      }

      res.json({
        success: true,
        data: {
          totalNotifications,
          unreadCount,
          typeDistribution,
          priorityDistribution,
          readRate,
          averageResponseTimeMinutes: Math.round(averageResponseTime / (1000 * 60)),
          period,
          dateRange: { startDate, endDate: now }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Clean expired notifications
  async cleanExpiredNotifications(req, res, next) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .eq('is_read', true);

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'Expired notifications cleaned',
        data: {
          deletedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Bulk operations
  async bulkMarkAsRead(req, res, next) {
    try {
      const { notificationIds } = req.body;
      const userId = req.user.id;

      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return next(new AppError('Notification IDs array is required', 400));
      }

      const readAt = new Date().toISOString();

      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: readAt })
        .in('id', notificationIds)
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'Notifications marked as read',
        data: {
          modifiedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Bulk archive
  async bulkArchive(req, res, next) {
    try {
      const { notificationIds } = req.body;
      const userId = req.user.id;

      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return next(new AppError('Notification IDs array is required', 400));
      }

      const { data, error } = await supabase
        .from('notifications')
        .update({ expires_at: new Date().toISOString() })
        .in('id', notificationIds)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'Notifications archived',
        data: {
          modifiedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // CLIENT NOTIFICATION FUNCTIONS

  // Get all notifications for a client
  async getClientNotifications(req, res, next) {
    try {
      const clientId = req.user.id;
      const {
        page = 1,
        limit = 20,
        type,
        priority,
        isRead
      } = req.query;

      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', clientId)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('created_at', { ascending: false });

      if (type) query = query.eq('type', type);
      if (priority) query = query.eq('priority', priority);
      if (isRead !== undefined) query = query.eq('is_read', isRead === 'true');

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      const notifications = (data || []).map(n => new Notification.Notification(n));

      res.json({
        success: true,
        data: {
          notifications: notifications.map(n => n.toJSON()),
          pagination: {
            current: parseInt(page),
            pages: Math.ceil((count || 0) / parseInt(limit)),
            total: count || 0
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get a specific notification for client
  async getClientNotification(req, res, next) {
    try {
      const { notificationId } = req.params;
      const clientId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: clientId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      // Mark as read if not already read
      if (!notification.isRead) {
        await notification.markAsRead();
      }

      res.json({
        success: true,
        data: notification.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Get notification counts for client
  async getClientNotificationCounts(req, res, next) {
    try {
      const clientId = req.user.id;

      const stats = await Notification.getStats(clientId);

      res.json({
        success: true,
        data: stats || {
          total: 0,
          unread: 0,
          urgent: 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark client notification as read
  async markClientNotificationAsRead(req, res, next) {
    try {
      const { notificationId } = req.params;
      const clientId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: clientId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      await notification.markAsRead();

      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      next(error);
    }
  },

  // Dismiss client notification
  async dismissClientNotification(req, res, next) {
    try {
      const { notificationId } = req.params;
      const clientId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: clientId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      await Notification.findByIdAndUpdate(notificationId, {
        expiresAt: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Notification dismissed'
      });
    } catch (error) {
      next(error);
    }
  },

  // Archive client notification
  async archiveClientNotification(req, res, next) {
    try {
      const { notificationId } = req.params;
      const clientId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: clientId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      await notification.archive();

      res.json({
        success: true,
        message: 'Notification archived'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get client notifications by type
  async getClientNotificationsByType(req, res, next) {
    try {
      const clientId = req.user.id;
      const { type } = req.params;

      const notifications = await Notification.findByType(clientId, type, {
        limit: 50
      });

      res.json({
        success: true,
        data: notifications.map(n => n.toJSON())
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark all client notifications as read
  async markAllClientNotificationsAsRead(req, res, next) {
    try {
      const clientId = req.user.id;
      const { type } = req.query;

      let query = supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', clientId)
        .eq('is_read', false);

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        message: 'All notifications marked as read',
        data: {
          modifiedCount: data?.length || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Track client notification click
  async trackClientNotificationClick(req, res, next) {
    try {
      const { notificationId } = req.params;
      const { metadata = {} } = req.body;
      const clientId = req.user.id;

      const notification = await Notification.findOne({
        id: notificationId,
        user_id: clientId
      });

      if (!notification) {
        return next(new AppError('Notification not found', 404));
      }

      // Track click in metadata
      const clicks = notification.data?.clicks || [];
      clicks.push({
        timestamp: new Date().toISOString(),
        ...metadata
      });

      await Notification.findByIdAndUpdate(notificationId, {
        data: { ...notification.data, clicks }
      });

      res.json({
        success: true,
        message: 'Click tracked successfully'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = notificationController;
