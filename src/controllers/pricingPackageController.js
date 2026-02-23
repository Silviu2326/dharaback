const { validationResult } = require('express-validator');
const { PricingPackage, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const pricingPackageController = {
  // Get all pricing packages
  async getPricingPackages(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        type,
        isActive,
        isPublic,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      let query = supabase
        .from('pricing_packages')
        .select('*', { count: 'exact' })
        .or(`therapistId.eq.${userId},is_public.eq.true`);

      if (type) query = query.eq('type', type);
      if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
      if (isPublic !== undefined) query = query.eq('is_public', isPublic === 'true');

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
                   .range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: {
          packages: data || [],
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

  // Get single pricing package
  async getPricingPackage(req, res, next) {
    try {
      const { packageId } = req.params;

      const packageData = await PricingPackage.findById(packageId);

      if (!packageData) {
        return next(new AppError('Package not found', 404));
      }

      res.json({
        success: true,
        data: packageData
      });
    } catch (error) {
      next(error);
    }
  },

  // Create new pricing package
  async createPricingPackage(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const userId = req.user.id;
      const packageData = {
        therapistId: userId,
        ...req.body
      };

      const pkg = await PricingPackage.create(packageData);

      res.status(201).json({
        success: true,
        data: pkg
      });
    } catch (error) {
      next(error);
    }
  },

  // Update pricing package
  async updatePricingPackage(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { packageId } = req.params;
      const userId = req.user.id;

      const existing = await PricingPackage.findById(packageId);
      if (!existing) {
        return next(new AppError('Package not found', 404));
      }

      if (existing.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      const updated = await PricingPackage.findByIdAndUpdate(packageId, req.body);

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete pricing package
  async deletePricingPackage(req, res, next) {
    try {
      const { packageId } = req.params;
      const userId = req.user.id;

      const existing = await PricingPackage.findById(packageId);
      if (!existing) {
        return next(new AppError('Package not found', 404));
      }

      if (existing.therapistId !== userId) {
        return next(new AppError('Not authorized', 403));
      }

      await PricingPackage.findByIdAndDelete(packageId);

      res.json({
        success: true,
        message: 'Package deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Activate/deactivate package
  async activatePackage(req, res, next) {
    try {
      const { packageId } = req.params;
      const userId = req.user.id;

      const existing = await PricingPackage.findById(packageId);
      if (!existing || existing.therapistId !== userId) {
        return next(new AppError('Package not found', 404));
      }

      const updated = await PricingPackage.findByIdAndUpdate(packageId, {
        isActive: true,
        activatedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  async deactivatePackage(req, res, next) {
    try {
      const { packageId } = req.params;
      const userId = req.user.id;

      const existing = await PricingPackage.findById(packageId);
      if (!existing || existing.therapistId !== userId) {
        return next(new AppError('Package not found', 404));
      }

      const updated = await PricingPackage.findByIdAndUpdate(packageId, {
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

  // Make package public/private
  async makePublic(req, res, next) {
    try {
      const { packageId } = req.params;
      const userId = req.user.id;

      const existing = await PricingPackage.findById(packageId);
      if (!existing || existing.therapistId !== userId) {
        return next(new AppError('Package not found', 404));
      }

      const updated = await PricingPackage.findByIdAndUpdate(packageId, {
        isPublic: true
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  async makePrivate(req, res, next) {
    try {
      const { packageId } = req.params;
      const userId = req.user.id;

      const existing = await PricingPackage.findById(packageId);
      if (!existing || existing.therapistId !== userId) {
        return next(new AppError('Package not found', 404));
      }

      const updated = await PricingPackage.findByIdAndUpdate(packageId, {
        isPublic: false
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  // Calculate final price with discounts
  async calculatePrice(req, res, next) {
    try {
      const { packageId } = req.params;
      const { discountCode, clientId } = req.body;

      const pkg = await PricingPackage.findById(packageId);
      if (!pkg) {
        return next(new AppError('Package not found', 404));
      }

      let finalPrice = pkg.price;
      let appliedDiscount = 0;

      // Apply discount if provided (simplified - would check coupon validity)
      if (discountCode && pkg.discount) {
        if (pkg.discount.type === 'percentage') {
          appliedDiscount = (pkg.price * pkg.discount.value) / 100;
        } else {
          appliedDiscount = pkg.discount.value;
        }
        finalPrice = Math.max(0, finalPrice - appliedDiscount);
      }

      res.json({
        success: true,
        data: {
          originalPrice: pkg.price,
          discount: appliedDiscount,
          finalPrice,
          savings: pkg.original_price ? pkg.original_price - finalPrice : 0,
          currency: pkg.currency || 'EUR'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get package statistics
  async getPackageStats(req, res, next) {
    try {
      const userId = req.user.id;
      const { packageId } = req.params;

      let query = supabase
        .from('pricing_packages')
        .select('analytics')
        .eq('id', packageId)
        .eq('therapist_id', userId);

      const { data, error } = await query.single();

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: data?.analytics || {
          totalSales: 0,
          totalRevenue: 0,
          averageRating: 0,
          viewsCount: 0,
          conversionRate: 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Add testimonial to package
  async addTestimonial(req, res, next) {
    try {
      const { packageId } = req.params;
      const userId = req.user.id;
      const { rating, comment, clientId } = req.body;

      const pkg = await PricingPackage.findById(packageId);
      if (!pkg) {
        return next(new AppError('Package not found', 404));
      }

      const testimonials = pkg.testimonials || [];
      testimonials.push({
        clientId,
        rating,
        comment,
        createdAt: new Date().toISOString()
      });

      const updated = await PricingPackage.findByIdAndUpdate(packageId, {
        testimonials,
        analytics: {
          ...pkg.analytics,
          averageRating: testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length
        }
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = pricingPackageController;
