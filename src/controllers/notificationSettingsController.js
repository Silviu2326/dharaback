const { validationResult } = require('express-validator');
const { NotificationSettings, User } = require('../models');
const { supabase } = require('../config/supabase');

const notificationSettingsController = {
  async getSettings(req, res) {
    try {
      const userId = req.user.id;

      let settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        settings = await NotificationSettings.createDefault(userId);
      }

      res.json({
        success: true,
        data: settings.toJSON()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching notification settings',
        error: error.message
      });
    }
  },

  async updateSettings(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;

      let settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        settings = await NotificationSettings.createDefault(userId);
      }

      const allowedUpdates = [
        'emailEnabled', 'pushEnabled', 'smsEnabled', 'whatsappEnabled',
        'bookingConfirmations', 'bookingReminders', 'bookingCancellations',
        'newMessages', 'paymentNotifications', 'marketingEmails',
        'reminderTime', 'quietHours', 'customPreferences'
      ];

      const updates = {};
      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      const updatedSettings = await NotificationSettings.findByIdAndUpdate(
        settings.id,
        updates,
        { new: true }
      );

      res.json({
        success: true,
        message: 'Notification settings updated successfully',
        data: updatedSettings.toJSON()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating notification settings',
        error: error.message
      });
    }
  },

  async updateEmailSettings(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { enabled } = req.body;

      let settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        settings = await NotificationSettings.createDefault(userId);
      }

      const updates = {};
      if (enabled !== undefined) updates.emailEnabled = enabled;

      const updatedSettings = await NotificationSettings.findByIdAndUpdate(
        settings.id,
        updates,
        { new: true }
      );

      res.json({
        success: true,
        message: 'Email settings updated successfully',
        data: {
          emailEnabled: updatedSettings.emailEnabled
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating email settings',
        error: error.message
      });
    }
  },

  async updateSmsSettings(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { enabled } = req.body;

      let settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        settings = await NotificationSettings.createDefault(userId);
      }

      const updates = {};
      if (enabled !== undefined) updates.smsEnabled = enabled;

      const updatedSettings = await NotificationSettings.findByIdAndUpdate(
        settings.id,
        updates,
        { new: true }
      );

      res.json({
        success: true,
        message: 'SMS settings updated successfully',
        data: {
          smsEnabled: updatedSettings.smsEnabled
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating SMS settings',
        error: error.message
      });
    }
  },

  async updatePushSettings(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { enabled } = req.body;

      let settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        settings = await NotificationSettings.createDefault(userId);
      }

      const updates = {};
      if (enabled !== undefined) updates.pushEnabled = enabled;

      const updatedSettings = await NotificationSettings.findByIdAndUpdate(
        settings.id,
        updates,
        { new: true }
      );

      res.json({
        success: true,
        message: 'Push notification settings updated successfully',
        data: {
          pushEnabled: updatedSettings.pushEnabled
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating push notification settings',
        error: error.message
      });
    }
  },

  async updateCategorySettings(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { category } = req.params;
      const userId = req.user.id;

      const validCategories = ['booking', 'message', 'payment', 'reminder', 'marketing', 'system'];

      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category'
        });
      }

      let settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        settings = await NotificationSettings.createDefault(userId);
      }

      const { enabled } = req.body;
      const updates = {};

      // Map category to field name
      const categoryFieldMap = {
        booking: 'bookingConfirmations',
        message: 'newMessages',
        payment: 'paymentNotifications',
        reminder: 'bookingReminders',
        marketing: 'marketingEmails',
        system: 'bookingCancellations'
      };

      if (enabled !== undefined) {
        updates[categoryFieldMap[category]] = enabled;
      }

      const updatedSettings = await NotificationSettings.findByIdAndUpdate(
        settings.id,
        updates,
        { new: true }
      );

      res.json({
        success: true,
        message: `${category} category settings updated successfully`,
        data: {
          category,
          enabled: updatedSettings[categoryFieldMap[category]]
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating category settings',
        error: error.message
      });
    }
  },

  async updateDoNotDisturb(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { enabled, start, end, timezone } = req.body;

      let settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        settings = await NotificationSettings.createDefault(userId);
      }

      const quietHours = { ...settings.quietHours };

      if (enabled !== undefined) quietHours.enabled = enabled;
      if (start !== undefined) quietHours.start = start;
      if (end !== undefined) quietHours.end = end;
      if (timezone !== undefined) quietHours.timezone = timezone;

      const updatedSettings = await NotificationSettings.findByIdAndUpdate(
        settings.id,
        { quietHours },
        { new: true }
      );

      res.json({
        success: true,
        message: 'Do Not Disturb settings updated successfully',
        data: updatedSettings.quietHours
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating Do Not Disturb settings',
        error: error.message
      });
    }
  },

  async testNotification(req, res) {
    try {
      const { channel, category = 'system' } = req.body;
      const userId = req.user.id;

      const settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        return res.status(404).json({
          success: false,
          message: 'Notification settings not found'
        });
      }

      const shouldSend = settings.shouldSendNotification(category, channel);

      if (!shouldSend) {
        return res.json({
          success: true,
          message: 'Test notification not sent due to user preferences',
          data: {
            sent: false,
            reason: 'blocked_by_preferences'
          }
        });
      }

      const testMessage = {
        title: 'Test Notification',
        body: 'This is a test notification from Dharaterapeutas',
        category,
        channel,
        timestamp: new Date()
      };

      res.json({
        success: true,
        message: 'Test notification sent successfully',
        data: {
          sent: true,
          channel,
          category,
          message: testMessage
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error sending test notification',
        error: error.message
      });
    }
  },

  async getPreferredChannels(req, res) {
    try {
      const { category } = req.params;
      const userId = req.user.id;

      const settings = await NotificationSettings.findByUserId(userId);

      if (!settings) {
        return res.json({
          success: true,
          data: [],
          category
        });
      }

      const preferredChannels = settings.getPreferredChannels(category);

      res.json({
        success: true,
        data: preferredChannels,
        category,
        count: preferredChannels.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching preferred channels',
        error: error.message
      });
    }
  },

  async getChannelStats(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Get stats from all settings
      const { data: settings, error } = await supabase
        .from('notification_settings')
        .select('*');

      if (error) throw new Error(error.message);

      const stats = {
        totalUsers: settings?.length || 0,
        emailEnabled: settings?.filter(s => s.email_enabled).length || 0,
        smsEnabled: settings?.filter(s => s.sms_enabled).length || 0,
        pushEnabled: settings?.filter(s => s.push_enabled).length || 0,
        whatsappEnabled: settings?.filter(s => s.whatsapp_enabled).length || 0
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching channel statistics',
        error: error.message
      });
    }
  },

  async resetSettings(req, res) {
    try {
      const userId = req.user.id;

      // Delete existing settings
      const existing = await NotificationSettings.findByUserId(userId);
      if (existing) {
        await NotificationSettings.findByIdAndDelete(existing.id);
      }

      // Create default settings
      const settings = await NotificationSettings.createDefault(userId);

      res.json({
        success: true,
        message: 'Settings reset to default',
        data: settings.toJSON()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error resetting settings',
        error: error.message
      });
    }
  }
};

module.exports = notificationSettingsController;
