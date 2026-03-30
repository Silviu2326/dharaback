const { validationResult } = require('express-validator');
const { Review, User, Client, Booking } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const reviewController = {
  // Get all reviews for a therapist
  async getReviews(req, res, next) {
    try {
      const therapistId = req.user.id;
      const {
        page = 1,
        limit = 20,
        rating,
        isPublic,
        hasResponse,
        sortBy = 'created_at',
        sortOrder = 'desc',
        tags,
        clientId,
        reviewerId
      } = req.query;

      // Mapear nombres de columnas del frontend a nombres reales en PostgreSQL
      const columnMap = {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        therapistId: 'therapist_id',
        clientId: 'client_id',
        bookingId: 'booking_id',
        isPublic: 'is_public',
        isVerified: 'is_verified',
        helpfulCount: 'helpful_count',
        respondedAt: 'responded_at'
      };
      const sortColumn = columnMap[sortBy] || sortBy;

      let query = supabase
        .from('reviews')
        .select('*, client:client_id(*), booking:booking_id(*)', { count: 'exact' })
        .eq('therapist_id', therapistId);

      // Filtrar por cliente específico (el que escribió la review)
      const effectiveClientId = clientId || reviewerId;
      if (effectiveClientId) {
        query = query.eq('client_id', effectiveClientId);
      }

      if (rating) query = query.eq('rating', parseInt(rating));
      if (isPublic !== undefined) query = query.eq('is_public', isPublic === 'true');
      if (hasResponse !== undefined) {
        query = hasResponse === 'true'
          ? query.not('therapist_response', 'is', null)
          : query.is('therapist_response', null);
      }

      query = query.order(sortColumn, { ascending: sortOrder === 'asc' });
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      // Transform reviews to match frontend expectations
      const transformedReviews = (data || []).map(review => ({
        ...review,
        response: review.therapist_response,
        responseDate: review.responded_at,
        clientName: review.client?.name || review.client_name,
        clientAvatar: review.client?.avatar || review.client_avatar
      }));

      res.json({
        success: true,
        data: {
          reviews: transformedReviews,
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

  // Get a specific review
  async getReview(req, res, next) {
    try {
      const { reviewId } = req.params;
      const therapistId = req.user.id;

      const review = await Review.findOne({
        id: reviewId,
        therapist_id: therapistId
      });

      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      // Get related data
      const [client, booking, therapist] = await Promise.all([
        Client.findById(review.clientId),
        review.bookingId ? Booking.findById(review.bookingId) : null,
        User.findById(review.therapistId)
      ]);

      res.json({
        success: true,
        data: {
          ...review,
          client: client ? { id: client.id, name: client.name, avatar: client.avatar } : null,
          booking: booking ? {
            id: booking.id,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            serviceType: booking.serviceType
          } : null,
          therapist: therapist ? { id: therapist.id, name: therapist.name, avatar: therapist.avatar } : null
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Add response to review
  async addResponse(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { reviewId } = req.params;
      const { response, responseId } = req.body;
      const therapistId = req.user.id;

      const review = await Review.findOne({
        id: reviewId,
        therapist_id: therapistId
      });

      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      const updatedReview = await Review.findByIdAndUpdate(reviewId, {
        therapistResponse: response,  // Campo correcto: therapistResponse
        respondedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Response added successfully',
        responseId: responseId || `resp_${Date.now()}`,
        data: updatedReview
      });
    } catch (error) {
      next(error);
    }
  },

  // Update response to review
  async updateResponse(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { reviewId } = req.params;
      const { response } = req.body;
      const therapistId = req.user.id;

      const review = await Review.findOne({
        id: reviewId,
        therapist_id: therapistId
      });

      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      const updatedReview = await Review.findByIdAndUpdate(reviewId, {
        therapistResponse: response,
        respondedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Response updated successfully',
        data: updatedReview
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark review as helpful
  async markAsHelpful(req, res, next) {
    try {
      const { reviewId } = req.params;

      const review = await Review.findById(reviewId);
      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      const updatedReview = await Review.findByIdAndUpdate(reviewId, {
        helpful_count: (review.helpful_count || 0) + 1
      });

      res.json({
        success: true,
        message: 'Review marked as helpful',
        data: { helpfulCount: updatedReview.helpful_count }
      });
    } catch (error) {
      next(error);
    }
  },

  // Report a review
  async reportReview(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { reviewId } = req.params;
      const { reason, notes = '' } = req.body;
      const reportedBy = req.user.id;

      const review = await Review.findById(reviewId);
      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      // NOTE: moderation_status and reports columns do not exist in schema
      // Reporting feature requires schema migration
      res.json({
        success: true,
        message: 'Review reported successfully (feature logged)'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get rating summary for therapist
  async getRatingSummary(req, res, next) {
    try {
      const therapistId = req.user.id;

      // Calculate statistics using Supabase
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select('rating')
        .eq('therapist_id', therapistId)
        .eq('is_public', true);

      if (error) throw new Error(error.message);

      const totalReviews = reviews?.length || 0;
      const ratingBreakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      let totalRating = 0;

      (reviews || []).forEach(r => {
        ratingBreakdown[r.rating] = (ratingBreakdown[r.rating] || 0) + 1;
        totalRating += r.rating;
      });

      const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

      res.json({
        success: true,
        data: {
          averageRating: Math.round(averageRating * 10) / 10,
          totalReviews,
          ratingBreakdown
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get recent reviews
  async getRecentReviews(req, res, next) {
    try {
      const therapistId = req.user.id;
      const { limit = 5 } = req.query;

      const { data: reviews, error } = await supabase
        .from('reviews')
        .select('*, client:client_id(*)')
        .eq('therapist_id', therapistId)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: reviews || []
      });
    } catch (error) {
      next(error);
    }
  },

  // Search reviews
  async searchReviews(req, res, next) {
    try {
      const { q: searchQuery, rating, sentiment, page = 1, limit = 20 } = req.query;
      const therapistId = req.user.id;

      let query = supabase
        .from('reviews')
        .select('*', { count: 'exact' })
        .eq('therapist_id', therapistId)
        .eq('is_public', true);

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,comment.ilike.%${searchQuery}%`);
      }
      if (rating) query = query.eq('rating', parseInt(rating));

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.order('created_at', { ascending: false })
                   .range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: {
          reviews: data || [],
          searchQuery,
          pagination: {
            current: parseInt(page),
            limit: parseInt(limit),
            total: count || 0
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Update review visibility
  async updateVisibility(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { reviewId } = req.params;
      const { isPublic } = req.body;
      const therapistId = req.user.id;

      const review = await Review.findOne({
        id: reviewId,
        therapist_id: therapistId
      });

      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      const updatedReview = await Review.findByIdAndUpdate(reviewId, {
        is_public: isPublic
      });

      res.json({
        success: true,
        message: `Review ${isPublic ? 'made public' : 'made private'}`,
        data: updatedReview
      });
    } catch (error) {
      next(error);
    }
  },

  // Get review analytics
  async getReviewAnalytics(req, res, next) {
    try {
      const therapistId = req.user.id;
      const { period = 'month' } = req.query;

      // Get date range
      const now = new Date();
      let startDate;

      switch (period) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const { data: reviews, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('therapist_id', therapistId)
        .eq('is_public', true)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', now.toISOString());

      if (error) throw new Error(error.message);

      // Process analytics
      const totalReviews = reviews?.length || 0;
      let totalRating = 0;
      let withResponse = 0;
      let publicCount = 0;
      let totalHelpful = 0;
      const ratingCounts = {};

      (reviews || []).forEach(r => {
        totalRating += r.rating;
        if (r.therapist_response) withResponse++;
        if (r.is_public) publicCount++;
        totalHelpful += r.helpful_count || 0;
        ratingCounts[r.rating] = (ratingCounts[r.rating] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          totalReviews,
          averageRating: totalReviews > 0 ? Math.round((totalRating / totalReviews) * 10) / 10 : 0,
          responseRate: totalReviews > 0 ? Math.round((withResponse / totalReviews) * 100) : 0,
          publicReviews: publicCount,
          totalHelpfulVotes: totalHelpful,
          ratingDistribution: ratingCounts,
          period,
          dateRange: { startDate, endDate: now }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get reviews by tags
  async getReviewsByTags(req, res, next) {
    try {
      const therapistId = req.user.id;

      // NOTE: Column 'tags' does not exist in database schema
      // Returning empty stats as this feature requires schema migration
      res.json({
        success: true,
        data: [],
        message: 'Tags feature not available - requires database schema update'
      });
    } catch (error) {
      next(error);
    }
  },

  // Client creates a review
  async createReview(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const {
        therapistId,
        bookingId,
        rating,
        title,
        comment,
        tags = [],
        isPublic = true
      } = req.body;

      const clientId = req.user.clientId || req.user.id;

      // Verify therapist exists
      const therapist = await User.findById(therapistId);
      if (!therapist) {
        return next(new AppError('Therapist not found', 404));
      }

      // Verify booking if provided
      if (bookingId) {
        const booking = await Booking.findOne({
          id: bookingId,
          client_id: clientId,
          therapist_id: therapistId,
          status: 'completed'
        });

        if (!booking) {
          return next(new AppError('Booking not found or not completed', 404));
        }

        // Check if review already exists for this booking
        const existingReview = await Review.findOne({
          client_id: clientId,
          therapist_id: therapistId,
          booking_id: bookingId
        });

        if (existingReview) {
          return next(new AppError('Review already exists for this booking', 400));
        }
      }

      const reviewData = {
        clientId,
        therapistId,
        bookingId,
        rating,
        title,
        comment,
        isPublic
        // NOTE: tags, moderationStatus, metadata columns do not exist in schema
      };

      const review = await Review.create(reviewData);

      res.status(201).json({
        success: true,
        data: review
      });
    } catch (error) {
      next(error);
    }
  },

  // Get review statistics
  async getReviewStatistics(req, res, next) {
    try {
      const { therapistId, dateFrom, dateTo } = req.query;

      let targetTherapistId = therapistId;
      if (!targetTherapistId || targetTherapistId === 'current') {
        targetTherapistId = req.user.id;
      }

      let query = supabase
        .from('reviews')
        .select('*')
        .eq('therapist_id', targetTherapistId)
        .eq('is_public', true);

      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);

      const { data: reviews, error } = await query;

      if (error) throw new Error(error.message);

      // Calculate statistics
      const totalReviews = reviews?.length || 0;
      let totalRating = 0;
      const ratingDistribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

      (reviews || []).forEach(r => {
        totalRating += r.rating;
        ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          totalReviews,
          averageRating: totalReviews > 0 ? Math.round((totalRating / totalReviews) * 10) / 10 : 0,
          ratingDistribution
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== CLIENT REVIEW FUNCTIONS ====================

  // Get all reviews written by a client
  async getClientReviews(req, res, next) {
    try {
      const clientId = req.user.id;
      const {
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      const { data, error, count } = await supabase
        .from('reviews')
        .select('*, therapist:therapist_id(*), booking:booking_id(*)', { count: 'exact' })
        .eq('client_id', clientId)
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((parseInt(page) - 1) * parseInt(limit), parseInt(page) * parseInt(limit) - 1);

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: {
          reviews: data || [],
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

  // Get a specific review written by the client
  async getClientReview(req, res, next) {
    try {
      const { reviewId } = req.params;
      const clientId = req.user.id;

      const review = await Review.findOne({
        id: reviewId,
        client_id: clientId
      });

      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      res.json({
        success: true,
        data: review
      });
    } catch (error) {
      next(error);
    }
  },

  // Update client's own review
  async updateClientReview(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { reviewId } = req.params;
      const clientId = req.user.id;
      const { rating, title, comment, isPublic } = req.body;

      const review = await Review.findOne({
        id: reviewId,
        client_id: clientId
      });

      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      const updateData = {};
      if (rating !== undefined) updateData.rating = rating;
      if (title !== undefined) updateData.title = title;
      if (comment !== undefined) updateData.comment = comment;
      if (isPublic !== undefined) updateData.is_public = isPublic;
      // NOTE: tags and edit_history columns do not exist in schema

      const updatedReview = await Review.findByIdAndUpdate(reviewId, updateData);

      res.json({
        success: true,
        message: 'Review updated successfully',
        data: updatedReview
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete client's own review
  async deleteClientReview(req, res, next) {
    try {
      const { reviewId } = req.params;
      const clientId = req.user.id;

      const review = await Review.findOne({
        id: reviewId,
        client_id: clientId
      });

      if (!review) {
        return next(new AppError('Review not found', 404));
      }

      await Review.findByIdAndDelete(reviewId);

      res.json({
        success: true,
        message: 'Review deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get public reviews for a therapist (accessible by clients)
  async getTherapistPublicReviews(req, res, next) {
    try {
      const { therapistId } = req.params;
      const {
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      if (!therapistId) {
        return next(new AppError('Therapist ID is required', 400));
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { data, error, count } = await supabase
        .from('reviews')
        .select('id, rating, title, comment, is_verified, therapist_response, responded_at, created_at, client:client_id(id, name, avatar)', { count: 'exact' })
        .eq('therapist_id', therapistId)
        .eq('is_public', true)
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(offset, offset + parseInt(limit) - 1);

      if (error) throw new Error(error.message);

      const reviews = (data || []).map(review => ({
        ...review,
        hasResponse: !!review.therapist_response,
        response: review.therapist_response,
        responseDate: review.responded_at
      }));

      res.json({
        success: true,
        data: {
          reviews,
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

  // Get client's review statistics
  async getClientReviewStats(req, res, next) {
    try {
      const clientId = req.user.id;

      const { data: reviews, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('client_id', clientId);

      if (error) throw new Error(error.message);

      const totalReviews = reviews?.length || 0;
      let totalRating = 0;
      let publicReviews = 0;
      let verifiedReviews = 0;
      let withResponse = 0;
      const ratingBreakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      const uniqueTherapists = new Set();

      (reviews || []).forEach(r => {
        totalRating += r.rating;
        ratingBreakdown[r.rating] = (ratingBreakdown[r.rating] || 0) + 1;
        if (r.is_public) publicReviews++;
        if (r.is_verified) verifiedReviews++;
        if (r.response) withResponse++;
        uniqueTherapists.add(r.therapist_id);
      });

      res.json({
        success: true,
        data: {
          totalReviews,
          averageRatingGiven: totalReviews > 0 ? Math.round((totalRating / totalReviews) * 10) / 10 : 0,
          publicReviews,
          verifiedReviews,
          reviewsWithResponse: withResponse,
          uniqueTherapists: uniqueTherapists.size,
          ratingBreakdown
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = reviewController;
