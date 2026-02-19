const { validationResult } = require('express-validator');
const { Coupon } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');

const couponController = {
  // Get all coupons
  async getCoupons(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        type,
        targetAudience,
        isActive,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      let query = supabase
        .from('coupons')
        .select('*', { count: 'exact' })
        .or(`therapist_id.eq.${userId},is_global.eq.true`);

      if (type) query = query.eq('type', type);
      if (targetAudience) query = query.eq('target_audience', targetAudience);
      if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
                   .range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: {
          coupons: data || [],
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

  // Get single coupon
  async getCoupon(req, res, next) {
    try {
      const { couponId } = req.params;

      const coupon = await Coupon.findById(couponId);

      if (!coupon) {
        return next(new AppError('Coupon not found', 404));
      }

      res.json({
        success: true,
        data: coupon
      });
    } catch (error) {
      next(error);
    }
  },

  // Create new coupon
  async createCoupon(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const userId = req.user.id;
      const {
        code,
        name,
        description,
        type = 'percentage',
        value,
        maxDiscount,
        minOrderAmount,
        maxUsageCount,
        maxUsagePerClient,
        validFrom,
        validUntil,
        targetAudience = 'all',
        applicableServices,
        excludedServices
      } = req.body;

      // Generate unique code if not provided
      let couponCode = code;
      if (!couponCode) {
        const prefix = type === 'percentage' ? 'PCT' : 'AMT';
        const hash = crypto.randomBytes(3).toString('hex').toUpperCase();
        couponCode = `${prefix}-${hash}`;
      }

      // Check if code already exists
      const existing = await Coupon.findByCode(couponCode);
      if (existing) {
        return next(new AppError('Coupon code already exists', 400));
      }

      const couponData = {
        therapistId: userId,
        code: couponCode,
        name,
        description,
        type,
        value,
        maxDiscount,
        minOrderAmount,
        maxUsageCount: maxUsageCount || -1,
        maxUsagePerClient: maxUsagePerClient || 1,
        validFrom: validFrom || new Date().toISOString(),
        validUntil,
        targetAudience,
        applicableServices: applicableServices || [],
        excludedServices: excludedServices || [],
        isActive: true,
        usageCount: 0
      };

      const coupon = await Coupon.create(couponData);

      res.status(201).json({
        success: true,
        data: coupon
      });
    } catch (error) {
      next(error);
    }
  },

  // Update coupon
  async updateCoupon(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { couponId } = req.params;
      const userId = req.user.id;

      const existing = await Coupon.findById(couponId);
      if (!existing) {
        return next(new AppError('Coupon not found', 404));
      }

      if (existing.therapist_id !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await Coupon.findByIdAndUpdate(couponId, req.body);

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete coupon
  async deleteCoupon(req, res, next) {
    try {
      const { couponId } = req.params;
      const userId = req.user.id;

      const existing = await Coupon.findById(couponId);
      if (!existing) {
        return next(new AppError('Coupon not found', 404));
      }

      if (existing.therapist_id !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      await Coupon.findByIdAndDelete(couponId);

      res.json({
        success: true,
        message: 'Coupon deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Validate coupon
  async validateCoupon(req, res, next) {
    try {
      const { code } = req.params;
      const { orderAmount, serviceType, clientId } = req.query;

      const coupon = await Coupon.findByCode(code);

      if (!coupon) {
        return next(new AppError('Coupon not found', 404));
      }

      const validation = coupon.validateForUse(
        clientId,
        parseFloat(orderAmount),
        serviceType
      );

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.reason,
          data: { valid: false }
        });
      }

      const discountAmount = coupon.calculateDiscount(parseFloat(orderAmount));

      res.json({
        success: true,
        data: {
          valid: true,
          coupon: {
            id: coupon.id,
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            value: coupon.value
          },
          originalAmount: parseFloat(orderAmount),
          discountAmount,
          finalAmount: parseFloat(orderAmount) - discountAmount
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Apply coupon
  async applyCoupon(req, res, next) {
    try {
      const { code } = req.params;
      const userId = req.user.id;
      const { orderAmount, serviceType } = req.body;

      const coupon = await Coupon.findByCode(code);

      if (!coupon) {
        return next(new AppError('Coupon not found', 404));
      }

      const validation = coupon.validateForUse(userId, orderAmount, serviceType);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.reason,
          data: { valid: false }
        });
      }

      const discountAmount = coupon.calculateDiscount(orderAmount);
      const finalAmount = orderAmount - discountAmount;

      // Record usage
      await coupon.use(userId);

      res.json({
        success: true,
        data: {
          valid: true,
          originalAmount: orderAmount,
          discountAmount,
          finalAmount,
          coupon: {
            id: coupon.id,
            code: coupon.code,
            name: coupon.name
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Deactivate coupon
  async deactivateCoupon(req, res, next) {
    try {
      const { couponId } = req.params;
      const userId = req.user.id;

      const existing = await Coupon.findById(couponId);
      if (!existing) {
        return next(new AppError('Coupon not found', 404));
      }

      if (existing.therapist_id !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await Coupon.findByIdAndUpdate(couponId, {
        isActive: false,
        deactivatedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Reactivate coupon
  async reactivateCoupon(req, res, next) {
    try {
      const { couponId } = req.params;
      const userId = req.user.id;

      const existing = await Coupon.findById(couponId);
      if (!existing) {
        return next(new AppError('Coupon not found', 404));
      }

      if (existing.therapist_id !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await Coupon.findByIdAndUpdate(couponId, {
        isActive: true,
        reactivatedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Extend validity
  async extendValidity(req, res, next) {
    try {
      const { couponId } = req.params;
      const userId = req.user.id;
      const { newValidUntil } = req.body;

      const existing = await Coupon.findById(couponId);
      if (!existing) {
        return next(new AppError('Coupon not found', 404));
      }

      if (existing.therapist_id !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await Coupon.findByIdAndUpdate(couponId, {
        validUntil: newValidUntil,
        extendedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Increase usage limit
  async increaseUsageLimit(req, res, next) {
    try {
      const { couponId } = req.params;
      const userId = req.user.id;
      const { additionalLimit } = req.body;

      const existing = await Coupon.findById(couponId);
      if (!existing) {
        return next(new AppError('Coupon not found', 404));
      }

      if (existing.therapist_id !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const newLimit = existing.max_usage_count + additionalLimit;
      const updated = await Coupon.findByIdAndUpdate(couponId, {
        maxUsageCount: newLimit
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Get coupon statistics
  async getCouponStats(req, res, next) {
    try {
      const userId = req.user.id;
      const { couponId } = req.params;

      let query = supabase
        .from('coupons')
        .select('usage_count, usage_history, revenue_impact')
        .eq('id', couponId)
        .eq('therapist_id', userId);

      const { data, error } = await query.single();

      if (error) throw new Error(error.message);

      if (!data) {
        return next(new AppError('Coupon not found', 404));
      }

      res.json({
        success: true,
        data: {
          usageCount: data.usage_count || 0,
          usageHistory: data.usage_history || [],
          revenueImpact: data.revenue_impact || 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get all coupon statistics for therapist
  async getAllCouponStats(req, res, next) {
    try {
      const userId = req.user.id;

      const { data, error } = await supabase
        .from('coupons')
        .select('id, code, name, usage_count, revenue_impact, type, is_active')
        .eq('therapist_id', userId);

      if (error) throw new Error(error.message);

      const stats = {
        totalCoupons: data?.length || 0,
        activeCoupons: data?.filter(c => c.is_active).length || 0,
        totalUsage: data?.reduce((sum, c) => sum + (c.usage_count || 0), 0) || 0,
        totalRevenueImpact: data?.reduce((sum, c) => sum + (c.revenue_impact || 0), 0) || 0,
        coupons: data || []
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = couponController;
