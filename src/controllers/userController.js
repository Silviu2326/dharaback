const multer = require('multer');
const path = require('path');
const { User, ProfessionalProfile } = require('../models');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'avatar') {
      cb(null, 'uploads/avatars/');
    } else if (file.fieldname === 'banner') {
      cb(null, 'uploads/banners/');
    } else {
      cb(new Error('Invalid field name'), null);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${req.user.id || req.user._id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Please upload only image files', 400), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
const getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id || req.user._id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Remove password from output
  user.password = undefined;

  console.log('[Backend getProfile] User from DB:', user);
  console.log('[Backend getProfile] user.videoPresentation:', user.videoPresentation);

  // Get professional profile separately if needed
  let professionalProfile = null;
  if (user.role === 'therapist') {
    try {
      professionalProfile = await ProfessionalProfile.findOne({ user_id: user.id || user._id });
    } catch (err) {
      // Profile might not exist yet
      console.log('Professional profile not found for user:', user.id || user._id);
    }
  }

  const responseData = {
    ...user.toJSON(),
    professionalProfile
  };
  
  console.log('[Backend getProfile] Response data:', responseData);

  res.status(200).json({
    success: true,
    data: responseData
  });
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res, next) => {
  const allowedFields = [
    'name',
    'preferences',
    'avatar',
    'banner',
    'videoPresentation'
  ];

  // Filter out disallowed fields
  const filteredBody = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });

  const user = await User.findByIdAndUpdate(
    req.user.id || req.user._id,
    filteredBody,
    {
      new: true
    }
  );

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Remove password from output
  user.password = undefined;

  res.status(200).json({
    success: true,
    data: user,
    message: 'Profile updated successfully'
  });
});

// @desc    Upload avatar
// @route   POST /api/users/upload-avatar
// @access  Private
const uploadAvatar = [
  upload.single('avatar'),
  asyncHandler(async (req, res, next) => {
    if (!req.file) {
      return next(new AppError('Please select an image to upload', 400));
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(
      req.user.id || req.user._id,
      { avatar: avatarPath },
      {
        new: true
      }
    );

    // Remove password from output
    user.password = undefined;

    res.status(200).json({
      success: true,
      data: {
        avatar: avatarPath,
        user: user
      },
      message: 'Avatar uploaded successfully'
    });
  })
];

// @desc    Upload banner
// @route   POST /api/users/upload-banner
// @access  Private
const uploadBanner = [
  upload.single('banner'),
  asyncHandler(async (req, res, next) => {
    if (!req.file) {
      return next(new AppError('Please select an image to upload', 400));
    }

    const bannerPath = `/uploads/banners/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(
      req.user.id || req.user._id,
      { banner: bannerPath },
      {
        new: true
      }
    );

    // Remove password from output
    user.password = undefined;

    res.status(200).json({
      success: true,
      data: {
        banner: bannerPath,
        user: user
      },
      message: 'Banner uploaded successfully'
    });
  })
];

// @desc    Delete user account
// @route   DELETE /api/users/profile
// @access  Private
const deleteAccount = asyncHandler(async (req, res, next) => {
  const { password } = req.body;

  if (!password) {
    return next(new AppError('Please provide your password to confirm account deletion', 400));
  }

  // Get user with password
  const user = await User.findById(req.user.id || req.user._id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Check password
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return next(new AppError('Invalid password', 400));
  }

  // Soft delete - deactivate account instead of permanently deleting
  await User.findByIdAndUpdate(
    req.user.id || req.user._id,
    {
      isActive: false,
      email: `deleted_${Date.now()}_${user.email}`
    },
    { new: false }
  );

  res.status(200).json({
    success: true,
    message: 'Account has been deactivated successfully'
  });
});

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private
const getUserStats = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id || req.user._id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  const stats = await user.getStats();

  res.status(200).json({
    success: true,
    data: stats
  });
});

// @desc    Update user preferences
// @route   PUT /api/users/preferences
// @access  Private
const updatePreferences = asyncHandler(async (req, res, next) => {
  const { language, timezone, notifications, privacy } = req.body;

  const updateData = {};

  if (language) updateData['preferences.language'] = language;
  if (timezone) updateData['preferences.timezone'] = timezone;
  if (notifications) {
    if (notifications.email !== undefined) updateData['preferences.notifications.email'] = notifications.email;
    if (notifications.push !== undefined) updateData['preferences.notifications.push'] = notifications.push;
    if (notifications.sms !== undefined) updateData['preferences.notifications.sms'] = notifications.sms;
  }
  if (privacy) {
    if (privacy.showProfile !== undefined) updateData['preferences.privacy.showProfile'] = privacy.showProfile;
    if (privacy.allowMessages !== undefined) updateData['preferences.privacy.allowMessages'] = privacy.allowMessages;
  }

  const user = await User.findByIdAndUpdate(
    req.user.id || req.user._id,
    { preferences: {
        language: language || req.user.preferences?.language || 'es',
        timezone: timezone || req.user.preferences?.timezone || 'Europe/Madrid',
        notifications: {
          email: notifications?.email ?? req.user.preferences?.notifications?.email ?? true,
          push: notifications?.push ?? req.user.preferences?.notifications?.push ?? true,
          sms: notifications?.sms ?? req.user.preferences?.notifications?.sms ?? false
        },
        privacy: {
          showProfile: privacy?.showProfile ?? req.user.preferences?.privacy?.showProfile ?? true,
          allowMessages: privacy?.allowMessages ?? req.user.preferences?.privacy?.allowMessages ?? true
        }
      }
    },
    { new: true }
  );

  res.status(200).json({
    success: true,
    data: user.preferences,
    message: 'Preferences updated successfully'
  });
});

// @desc    Get all therapists (for admin)
// @route   GET /api/users/therapists
// @access  Private (Admin only)
const getTherapists = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { status, verified, search } = req.query;

  // Build filters
  const filters = { role: 'therapist' };

  if (status) filters.is_active = status === 'active';
  if (verified) filters.is_verified = verified === 'true';
  
  // Search functionality - in Supabase we need to handle this differently
  let users = [];
  let total = 0;

  if (search) {
    // For search, we'll get all and filter in memory (or use RPC for better performance)
    const allUsers = await User.find({ filters });
    const searchLower = search.toLowerCase();
    users = allUsers.filter(u => 
      u.name?.toLowerCase().includes(searchLower) || 
      u.email?.toLowerCase().includes(searchLower)
    );
    total = users.length;
    users = users.slice(skip, skip + limit);
  } else {
    const result = await User.paginate({
      page,
      limit,
      filters
    });
    users = result.data;
    total = result.pagination.total;
  }

  // Get professional profiles for therapists
  const usersWithProfiles = await Promise.all(
    users.map(async (user) => {
      try {
        const profile = await ProfessionalProfile.findOne({ user_id: user.id || user._id });
        return {
          ...user.toJSON(),
          professionalProfile: profile ? {
            about: profile.about,
            therapies: profile.therapies,
            isAvailable: profile.isAvailable,
            stats: profile.stats
          } : null
        };
      } catch (err) {
        return user.toJSON();
      }
    })
  );

  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    data: usersWithProfiles,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
});

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  uploadBanner,
  deleteAccount,
  getUserStats,
  updatePreferences,
  getTherapists
};
