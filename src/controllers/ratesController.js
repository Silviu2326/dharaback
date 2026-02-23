const { Rates, User } = require('../models');
const { validationResult } = require('express-validator');

// Get rates with filters and pagination
const getRates = async (req, res) => {
  try {
    const {
      therapistId,
      currency,
      isActive,
      page = 1,
      limit = 20,
      sortBy = 'validFrom',
      sortOrder = 'desc'
    } = req.query;

    // Build filters
    const filters = {};

    // Access control
    const userId = req.user.id || req.user._id;
    if (req.user.role === 'therapist') {
      filters.therapistId = userId;
    } else if (therapistId && req.user.role === 'admin') {
      filters.therapistId = therapistId;
    }

    if (currency) filters.currency = currency;
    if (isActive !== undefined) filters.is_active = isActive === 'true';

    // Get rates with pagination
    const result = await Rates.paginate({
      page: parseInt(page),
      limit: parseInt(limit),
      filters,
      order: { column: sortBy, ascending: sortOrder === 'asc' }
    });

    // Get therapist data for each rate
    const ratesWithTherapists = await Promise.all(
      result.data.map(async (rate) => {
        try {
          const therapist = await User.findById(rate.therapistId);
          return {
            ...rate.toJSON(),
            therapist: therapist ? {
              id: therapist.id || therapist._id,
              name: therapist.name,
              email: therapist.email
            } : null
          };
        } catch (err) {
          return rate.toJSON();
        }
      })
    );

    res.json({
      success: true,
      data: ratesWithTherapists,
      pagination: {
        currentPage: result.pagination.page,
        totalPages: result.pagination.totalPages,
        totalDocs: result.pagination.total,
        hasNextPage: result.pagination.page < result.pagination.totalPages,
        hasPrevPage: result.pagination.page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching rates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching rates',
      error: error.message
    });
  }
};

// Create new rate
const createRate = async (req, res) => {
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
    const rateData = {
      ...req.body,
      therapistId: userId
    };

    const rate = await Rates.create(rateData);

    // Get therapist data
    const therapist = await User.findById(userId);

    res.status(201).json({
      success: true,
      message: 'Rate created successfully',
      data: {
        ...rate.toJSON(),
        therapist: therapist ? {
          id: therapist.id || therapist._id,
          name: therapist.name,
          email: therapist.email
        } : null
      }
    });
  } catch (error) {
    console.error('Error creating rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating rate',
      error: error.message
    });
  }
};

// Get single rate
const getRate = async (req, res) => {
  try {
    const { rateId } = req.params;

    const rate = await Rates.findById(rateId);

    if (!rate) {
      return res.status(404).json({
        success: false,
        message: 'Rate not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === 'therapist' && rate.therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get therapist data
    const therapist = await User.findById(rate.therapistId);

    res.json({
      success: true,
      data: {
        ...rate.toJSON(),
        therapist: therapist ? {
          id: therapist.id || therapist._id,
          name: therapist.name,
          email: therapist.email
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching rate',
      error: error.message
    });
  }
};

// Update rate
const updateRate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { rateId } = req.params;
    const updates = req.body;

    const rate = await Rates.findById(rateId);

    if (!rate) {
      return res.status(404).json({
        success: false,
        message: 'Rate not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role !== 'admin' && rate.therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Apply updates
    const updatedRate = await Rates.findByIdAndUpdate(rateId, updates, { new: true });

    // Get therapist data
    const therapist = await User.findById(updatedRate.therapistId);

    res.json({
      success: true,
      message: 'Rate updated successfully',
      data: {
        ...updatedRate.toJSON(),
        therapist: therapist ? {
          id: therapist.id || therapist._id,
          name: therapist.name,
          email: therapist.email
        } : null
      }
    });
  } catch (error) {
    console.error('Error updating rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating rate',
      error: error.message
    });
  }
};

// Delete rate
const deleteRate = async (req, res) => {
  try {
    const { rateId } = req.params;

    const rate = await Rates.findById(rateId);

    if (!rate) {
      return res.status(404).json({
        success: false,
        message: 'Rate not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role !== 'admin' && rate.therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await Rates.findByIdAndDelete(rateId);

    res.json({
      success: true,
      message: 'Rate deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting rate',
      error: error.message
    });
  }
};

// Get current rates for therapist
const getCurrentRates = async (req, res) => {
  try {
    const { therapistId } = req.params;
    const userId = req.user.id || req.user._id;

    // Check permissions
    if (req.user.role === 'therapist' && therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get or create rates for therapist
    const rates = await Rates.findByTherapist(therapistId);

    if (!rates) {
      // Create default rates
      const newRates = await Rates.create({
        therapistId,
        sessionPrice: 60,
        followUpPrice: 50,
        packagePrice: 200,
        coupleSessionPrice: 80,
        currency: 'EUR'
      });

      return res.json({
        success: true,
        data: newRates.toJSON()
      });
    }

    res.json({
      success: true,
      data: rates.toJSON()
    });
  } catch (error) {
    console.error('Error fetching current rates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching current rates',
      error: error.message
    });
  }
};

// Get pricing statistics
const getPricingStats = async (req, res) => {
  try {
    const stats = await Rates.getPricingStats();

    // Get additional metrics using Supabase
    const supabase = require('../config/supabase').supabase;

    const { count: totalRates } = await supabase
      .from('rates')
      .select('*', { count: 'exact', head: true });

    res.json({
      success: true,
      data: {
        currencyStatistics: stats.byCurrency || {},
        totals: {
          totalRates: totalRates || 0
        },
        averageSessionPrice: stats.averageSessionPrice || 0,
        minSessionPrice: stats.minSessionPrice || 0,
        maxSessionPrice: stats.maxSessionPrice || 0
      }
    });
  } catch (error) {
    console.error('Error fetching pricing stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pricing statistics',
      error: error.message
    });
  }
};

// Calculate session price
const calculateSessionPrice = async (req, res) => {
  try {
    const { rateId } = req.params;
    const { sessionType = 'individual', duration = 60, discountCode } = req.query;

    const rate = await Rates.findById(rateId);

    if (!rate) {
      return res.status(404).json({
        success: false,
        message: 'Rate not found'
      });
    }

    const calculatedPrice = rate.calculatePrice(
      sessionType,
      parseInt(duration),
      discountCode
    );

    const response = {
      sessionType,
      duration: parseInt(duration),
      basePrice: rate.sessionPrice,
      calculatedPrice,
      currency: rate.currency
    };

    if (discountCode && rate.customRates?.discounts) {
      const discount = rate.customRates.discounts.find(d => d.code === discountCode);
      if (discount) {
        response.discountApplied = {
          code: discountCode,
          type: discount.type,
          value: discount.value,
          savings: rate.sessionPrice - calculatedPrice
        };
      }
    }

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Error calculating session price:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating session price',
      error: error.message
    });
  }
};

module.exports = {
  getRates,
  createRate,
  getRate,
  updateRate,
  deleteRate,
  getCurrentRates,
  getPricingStats,
  calculateSessionPrice
};
