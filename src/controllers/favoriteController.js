const { Favorite, User, Client, ProfessionalProfile } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// @desc    Get client's favorite therapists
// @route   GET /api/favorites
// @access  Private (Client)
const getFavorites = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, sortBy = 'added_at', sortOrder = 'desc' } = req.query;
  const clientId = req.user.id;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { data: favorites, error, count } = await supabase
    .from('favorites')
    .select('*, therapist:therapist_id(*)', { count: 'exact' })
    .eq('client_id', clientId)
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(offset, offset + parseInt(limit) - 1);

  if (error) throw new Error(error.message);

  // Get professional profiles for therapists
  const enrichedFavorites = await Promise.all(
    (favorites || []).map(async (fav) => {
      if (fav.therapist) {
        const { data: profile } = await supabase
          .from('professional_profiles')
          .select('*')
          .eq('user_id', fav.therapist_id)
          .single();
        
        fav.therapist.profile = profile || null;
      }
      return fav;
    })
  );

  res.status(200).json({
    success: true,
    data: enrichedFavorites,
    pagination: {
      current: parseInt(page),
      pages: Math.ceil((count || 0) / parseInt(limit)),
      total: count || 0
    }
  });
});

// @desc    Add therapist to favorites
// @route   POST /api/favorites/:therapistId
// @access  Private (Client)
const addToFavorites = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;
  const { notes } = req.body;
  const clientId = req.user.id;

  // Check if therapist exists and is active
  const therapist = await User.findById(therapistId);
  if (!therapist) {
    return next(new AppError('Therapist not found', 404));
  }

  if (therapist.role !== 'therapist') {
    return next(new AppError('User is not a therapist', 400));
  }

  if (!therapist.is_active) {
    return next(new AppError('Therapist is not available', 400));
  }

  // Check if already in favorites
  const existingFavorite = await Favorite.findOne({
    client_id: clientId,
    therapist_id: therapistId
  });
  
  if (existingFavorite) {
    return next(new AppError('Therapist is already in your favorites', 409));
  }

  // Create favorite
  const favorite = await Favorite.create({
    clientId,
    therapistId,
    notes: notes?.trim()
  });

  // Get therapist details
  const { data: profile } = await supabase
    .from('professional_profiles')
    .select('*')
    .eq('user_id', therapistId)
    .single();

  res.status(201).json({
    success: true,
    data: {
      ...favorite,
      therapist: {
        ...therapist,
        profile: profile || null
      }
    },
    message: 'Therapist added to favorites successfully'
  });
});

// @desc    Remove therapist from favorites
// @route   DELETE /api/favorites/:therapistId
// @access  Private (Client)
const removeFromFavorites = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;
  const clientId = req.user.id;

  const favorite = await Favorite.findOne({
    client_id: clientId,
    therapist_id: therapistId
  });

  if (!favorite) {
    return next(new AppError('Therapist not found in favorites', 404));
  }

  await Favorite.findByIdAndDelete(favorite.id);

  res.status(200).json({
    success: true,
    message: 'Therapist removed from favorites successfully'
  });
});

// @desc    Check if therapist is in favorites
// @route   GET /api/favorites/check/:therapistId
// @access  Private (Client)
const checkIsFavorite = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;
  const clientId = req.user.id;

  const isFavorite = await Favorite.isFavorite(clientId, therapistId);

  res.status(200).json({
    success: true,
    data: {
      therapistId,
      isFavorite
    }
  });
});

// @desc    Update favorite notes
// @route   PUT /api/favorites/:therapistId
// @access  Private (Client)
const updateFavoriteNotes = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;
  const { notes } = req.body;
  const clientId = req.user.id;

  const favorite = await Favorite.findOne({
    client_id: clientId,
    therapist_id: therapistId
  });

  if (!favorite) {
    return next(new AppError('Favorite not found', 404));
  }

  const updatedFavorite = await Favorite.findByIdAndUpdate(favorite.id, {
    notes: notes?.trim()
  });

  // Get therapist details
  const therapist = await User.findById(therapistId);
  const { data: profile } = await supabase
    .from('professional_profiles')
    .select('*')
    .eq('user_id', therapistId)
    .single();

  res.status(200).json({
    success: true,
    data: {
      ...updatedFavorite,
      therapist: {
        ...therapist,
        profile: profile || null
      }
    },
    message: 'Favorite notes updated successfully'
  });
});

// @desc    Get favorite statistics for therapist
// @route   GET /api/favorites/stats/:therapistId
// @access  Public
const getFavoriteStats = asyncHandler(async (req, res, next) => {
  const { therapistId } = req.params;

  // Check if therapist exists
  const therapist = await User.findById(therapistId);
  if (!therapist || therapist.role !== 'therapist') {
    return next(new AppError('Therapist not found', 404));
  }

  const favoriteCount = await Favorite.getFavoriteCount(therapistId);

  // Get recent favorites (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { count: recentFavorites } = await supabase
    .from('favorites')
    .select('*', { count: 'exact', head: true })
    .eq('therapist_id', therapistId)
    .gte('added_at', thirtyDaysAgo.toISOString());

  res.status(200).json({
    success: true,
    data: {
      therapistId,
      totalFavorites: favoriteCount,
      recentFavorites: recentFavorites || 0,
      period: '30 days'
    }
  });
});

// @desc    Get therapists with most favorites
// @route   GET /api/favorites/popular
// @access  Public
const getPopularTherapists = asyncHandler(async (req, res, next) => {
  const { limit = 10, period = 'all' } = req.query;

  let query = supabase
    .from('favorites')
    .select('therapist_id, added_at');

  if (period === '30days') {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query = query.gte('added_at', thirtyDaysAgo.toISOString());
  } else if (period === '7days') {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    query = query.gte('added_at', sevenDaysAgo.toISOString());
  }

  const { data: favorites, error } = await query;

  if (error) throw new Error(error.message);

  // Count favorites per therapist
  const therapistCounts = {};
  (favorites || []).forEach(fav => {
    therapistCounts[fav.therapist_id] = (therapistCounts[fav.therapist_id] || 0) + 1;
  });

  // Sort and get top therapists
  const sortedTherapists = Object.entries(therapistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, parseInt(limit));

  // Get therapist details
  const popularTherapists = await Promise.all(
    sortedTherapists.map(async ([therapistId, count]) => {
      const therapist = await User.findById(therapistId);
      if (!therapist) return null;

      const { data: profile } = await supabase
        .from('professional_profiles')
        .select('*')
        .eq('user_id', therapistId)
        .single();

      return {
        therapistId,
        favoriteCount: count,
        therapist: {
          id: therapist.id,
          name: therapist.name,
          email: therapist.email,
          avatar: therapist.avatar,
          isVerified: therapist.is_verified,
          profile: profile || null
        }
      };
    })
  );

  const filteredTherapists = popularTherapists.filter(t => t !== null);

  res.status(200).json({
    success: true,
    data: filteredTherapists,
    count: filteredTherapists.length,
    period: period,
    message: `Top ${filteredTherapists.length} most favorited therapists`
  });
});

// @desc    Bulk manage favorites
// @route   POST /api/favorites/bulk
// @access  Private (Client)
const bulkManageFavorites = asyncHandler(async (req, res, next) => {
  const { action, therapistIds, notes } = req.body;
  const clientId = req.user.id;

  if (!action || !Array.isArray(therapistIds) || therapistIds.length === 0) {
    return next(new AppError('Action and therapist IDs are required', 400));
  }

  if (!['add', 'remove'].includes(action)) {
    return next(new AppError('Action must be either "add" or "remove"', 400));
  }

  if (action === 'add') {
    // Verify therapists exist and are active
    const { data: therapists } = await supabase
      .from('users')
      .select('id')
      .in('id', therapistIds)
      .eq('role', 'therapist')
      .eq('is_active', true);

    if ((therapists || []).length !== therapistIds.length) {
      return next(new AppError('Some therapists are invalid or not available', 400));
    }

    // Remove existing favorites to avoid duplicates
    await supabase
      .from('favorites')
      .delete()
      .eq('client_id', clientId)
      .in('therapist_id', therapistIds);

    // Create new favorites
    const favorites = therapistIds.map(therapistId => ({
      client_id: clientId,
      therapist_id: therapistId,
      notes: notes?.trim()
    }));

    const { data: result } = await supabase
      .from('favorites')
      .insert(favorites)
      .select();

    res.status(201).json({
      success: true,
      data: result || [],
      count: result?.length || 0,
      message: `${result?.length || 0} therapists added to favorites`
    });

  } else if (action === 'remove') {
    const { data: result } = await supabase
      .from('favorites')
      .delete()
      .eq('client_id', clientId)
      .in('therapist_id', therapistIds)
      .select();

    res.status(200).json({
      success: true,
      deletedCount: result?.length || 0,
      message: `${result?.length || 0} therapists removed from favorites`
    });
  }
});

module.exports = {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  checkIsFavorite,
  updateFavoriteNotes,
  getFavoriteStats,
  getPopularTherapists,
  bulkManageFavorites
};
