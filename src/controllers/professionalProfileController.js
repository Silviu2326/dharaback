const { ProfessionalProfile, User } = require('../models');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// @desc    Get professional profile
// @route   GET /api/profile
// @access  Private
const getProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  
  let profile = await ProfessionalProfile.findOne({ user_id: userId });

  // Create profile if it doesn't exist
  if (!profile) {
    profile = await ProfessionalProfile.create({
      userId: userId
    });
  }

  // Get user data separately
  const user = await User.findById(userId);

  // Map therapies to specialties for frontend compatibility
  const profileData = profile.toJSON();
  if (profileData.therapies) {
    profileData.specialties = profileData.therapies;
  }

  // Map education to credentials for frontend compatibility
  if (profileData.education) {
    profileData.credentials = profileData.education.map(edu => ({
      id: edu.id || edu._id,
      title: edu.degree,
      institution: edu.institution,
      year: edu.year,
      description: edu.description || ''
    }));
  }

  // Map rates data for frontend compatibility
  // Ensure rates has the structure expected by the frontend
  if (!profileData.rates) {
    profileData.rates = {};
  }
  
  // Ensure customRates exists within rates
  if (!profileData.rates.customRates) {
    profileData.rates.customRates = {
      currency: profileData.rates.currency || 'EUR',
      sessions: [],
      packages: []
    };
  }

  // If sessions are stored in rates.sessions, move them to rates.customRates.sessions
  if (profileData.rates.sessions && !profileData.rates.customRates.sessions) {
    profileData.rates.customRates.sessions = profileData.rates.sessions;
  }

  // If packages are stored in rates.packages, move them to rates.customRates.packages
  if (profileData.rates.packages && !profileData.rates.customRates.packages) {
    profileData.rates.customRates.packages = profileData.rates.packages;
  }

  // Ensure pricing structure exists for frontend compatibility
  if (!profileData.pricing) {
    profileData.pricing = {};
  }
  
  // Map customRates.sessions to pricing.sessions for backwards compatibility
  if (profileData.rates?.customRates?.sessions) {
    profileData.pricing.sessions = profileData.rates.customRates.sessions;
  }
  
  // Map customRates.packages to pricing.packages for backwards compatibility
  if (profileData.rates?.customRates?.packages) {
    profileData.pricing.packages = profileData.rates.customRates.packages;
  }

  // Add user data
  profileData.user = user ? {
    id: user.id || user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    banner: user.banner,
    isVerified: user.isVerified,
    verificationStatus: user.verificationStatus
  } : null;

  res.status(200).json({
    success: true,
    data: profileData
  });
});

// @desc    Update professional profile
// @route   PUT /api/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  
  const allowedFields = [
    'about',
    'therapies',
    'specialties', // Allow specialties field from frontend
    'isAvailable',
    'videoPresentation',
    'specializations',
    'languages',
    'education',
    'experience',
    'rates',
    'workLocations',
    'socialMedia',
    'externalLinks',
    'pricingPackages',
    'preferences',
    'legalInfo',
    'credentials', // Allow credentials from frontend
    'banner' // Allow banner field from frontend
  ];

  // Filter allowed fields
  const updateData = {};
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      updateData[key] = req.body[key];
    }
  });

  // Map specialties to therapies for backend compatibility
  if (req.body.specialties) {
    updateData.therapies = req.body.specialties;
    delete updateData.specialties; // Remove specialties to avoid conflicts
  }

  // Map credentials to education for backend compatibility
  if (req.body.credentials) {
    updateData.education = req.body.credentials.map(credential => ({
      degree: credential.title,
      institution: credential.institution,
      year: credential.year ? parseInt(credential.year) : new Date().getFullYear(),
      description: credential.description || ''
    }));
    delete updateData.credentials; // Remove credentials to avoid conflicts
  }

  let profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    // Create new profile
    profile = await ProfessionalProfile.create({
      userId: userId,
      ...updateData
    });
  } else {
    // Update existing profile
    profile = await ProfessionalProfile.findByIdAndUpdate(
      profile.id,
      updateData,
      { new: true }
    );
  }

  // Get user data separately
  const user = await User.findById(userId);

  // Map therapies to specialties for frontend compatibility
  const profileData = profile.toJSON();
  if (profileData.therapies) {
    profileData.specialties = profileData.therapies;
  }

  // Map education to credentials for frontend compatibility
  if (profileData.education) {
    profileData.credentials = profileData.education.map(edu => ({
      id: edu.id || edu._id,
      title: edu.degree,
      institution: edu.institution,
      year: edu.year,
      description: edu.description || ''
    }));
  }

  // Map rates data for frontend compatibility (same as in getProfile)
  if (!profileData.rates) {
    profileData.rates = {};
  }
  
  if (!profileData.rates.customRates) {
    profileData.rates.customRates = {
      currency: profileData.rates.currency || 'EUR',
      sessions: [],
      packages: []
    };
  }

  if (profileData.rates.sessions && !profileData.rates.customRates.sessions) {
    profileData.rates.customRates.sessions = profileData.rates.sessions;
  }

  if (profileData.rates.packages && !profileData.rates.customRates.packages) {
    profileData.rates.customRates.packages = profileData.rates.packages;
  }

  if (!profileData.pricing) {
    profileData.pricing = {};
  }
  
  if (profileData.rates?.customRates?.sessions) {
    profileData.pricing.sessions = profileData.rates.customRates.sessions;
  }
  
  if (profileData.rates?.customRates?.packages) {
    profileData.pricing.packages = profileData.rates.customRates.packages;
  }

  // Add user data
  profileData.user = user ? {
    id: user.id || user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    banner: user.banner,
    isVerified: user.isVerified,
    verificationStatus: user.verificationStatus
  } : null;

  res.status(200).json({
    success: true,
    data: profileData,
    message: 'Professional profile updated successfully'
  });
});

// @desc    Update profile stats
// @route   PUT /api/profile/stats
// @access  Private
const updateStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  
  let profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    return next(new AppError('Professional profile not found', 404));
  }

  const updatedStats = await profile.updateStats();

  res.status(200).json({
    success: true,
    data: updatedStats,
    message: 'Profile statistics updated successfully'
  });
});

// @desc    Get profile completeness
// @route   GET /api/profile/completeness
// @access  Private
const getProfileCompleteness = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  
  const profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    return res.status(200).json({
      success: true,
      data: { completeness: 0, missingFields: [] }
    });
  }

  const completeness = profile.getCompletenessPercentage();

  // Identify missing fields
  const missingFields = [];
  if (!profile.about || profile.about.length < 50) missingFields.push('about');
  if (!profile.therapies || profile.therapies.length === 0) missingFields.push('therapies');
  if (!profile.specializations || profile.specializations.length === 0) missingFields.push('specializations');
  if (!profile.languages || profile.languages.length === 0) missingFields.push('languages');
  if (!profile.education || profile.education.length === 0) missingFields.push('education');
  if (!profile.experience || profile.experience.length === 0) missingFields.push('experience');
  if (!profile.workLocations || profile.workLocations.length === 0) missingFields.push('workLocations');
  if (!profile.rates || profile.rates.sessionPrice <= 0) missingFields.push('rates');
  if (!profile.videoPresentation || !profile.videoPresentation.url) missingFields.push('videoPresentation');
  if (!profile.socialMedia || !profile.socialMedia.website) missingFields.push('website');

  res.status(200).json({
    success: true,
    data: {
      completeness,
      missingFields,
      recommendations: getMissingFieldRecommendations(missingFields)
    }
  });
});

// @desc    Add education
// @route   POST /api/profile/education
// @access  Private
const addEducation = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  const { degree, institution, year, description } = req.body;

  if (!degree || !institution) {
    return next(new AppError('Degree and institution are required', 400));
  }

  let profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    profile = await ProfessionalProfile.create({ userId: userId });
  }

  // Add new education to array
  const newEducation = {
    id: Date.now().toString(), // Generate temporary ID
    degree,
    institution,
    year,
    description
  };

  const updatedEducation = [...(profile.education || []), newEducation];

  await ProfessionalProfile.findByIdAndUpdate(
    profile.id,
    { education: updatedEducation },
    { new: false }
  );

  res.status(201).json({
    success: true,
    data: updatedEducation,
    message: 'Education added successfully'
  });
});

// @desc    Update education
// @route   PUT /api/profile/education/:id
// @access  Private
const updateEducation = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  const profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    return next(new AppError('Professional profile not found', 404));
  }

  const education = profile.education?.find(edu => (edu.id || edu._id) === req.params.id);

  if (!education) {
    return next(new AppError('Education entry not found', 404));
  }

  // Update the education entry
  const updatedEducation = profile.education.map(edu => {
    if ((edu.id || edu._id) === req.params.id) {
      return { ...edu, ...req.body };
    }
    return edu;
  });

  await ProfessionalProfile.findByIdAndUpdate(
    profile.id,
    { education: updatedEducation },
    { new: false }
  );

  res.status(200).json({
    success: true,
    data: updatedEducation,
    message: 'Education updated successfully'
  });
});

// @desc    Delete education
// @route   DELETE /api/profile/education/:id
// @access  Private
const deleteEducation = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  const profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    return next(new AppError('Professional profile not found', 404));
  }

  const education = profile.education?.find(edu => (edu.id || edu._id) === req.params.id);

  if (!education) {
    return next(new AppError('Education entry not found', 404));
  }

  // Remove the education entry
  const updatedEducation = profile.education.filter(edu => 
    (edu.id || edu._id) !== req.params.id
  );

  await ProfessionalProfile.findByIdAndUpdate(
    profile.id,
    { education: updatedEducation },
    { new: false }
  );

  res.status(200).json({
    success: true,
    data: updatedEducation,
    message: 'Education deleted successfully'
  });
});

// @desc    Add experience
// @route   POST /api/profile/experience
// @access  Private
const addExperience = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  const { position, company, startDate, endDate, isCurrent, description } = req.body;

  if (!position || !company || !startDate) {
    return next(new AppError('Position, company, and start date are required', 400));
  }

  let profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    profile = await ProfessionalProfile.create({ userId: userId });
  }

  // Add new experience to array
  const newExperience = {
    id: Date.now().toString(), // Generate temporary ID
    position,
    company,
    startDate,
    endDate: isCurrent ? undefined : endDate,
    isCurrent: isCurrent || false,
    description
  };

  const updatedExperience = [...(profile.experience || []), newExperience];

  await ProfessionalProfile.findByIdAndUpdate(
    profile.id,
    { experience: updatedExperience },
    { new: false }
  );

  res.status(201).json({
    success: true,
    data: updatedExperience,
    message: 'Experience added successfully'
  });
});

// @desc    Update experience
// @route   PUT /api/profile/experience/:id
// @access  Private
const updateExperience = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  const profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    return next(new AppError('Professional profile not found', 404));
  }

  const experience = profile.experience?.find(exp => (exp.id || exp._id) === req.params.id);

  if (!experience) {
    return next(new AppError('Experience entry not found', 404));
  }

  // Update the experience entry
  let updatedExperience = profile.experience.map(exp => {
    if ((exp.id || exp._id) === req.params.id) {
      const updated = { ...exp, ...req.body };
      // If marked as current, clear end date
      if (req.body.isCurrent) {
        updated.endDate = undefined;
      }
      return updated;
    }
    return exp;
  });

  await ProfessionalProfile.findByIdAndUpdate(
    profile.id,
    { experience: updatedExperience },
    { new: false }
  );

  res.status(200).json({
    success: true,
    data: updatedExperience,
    message: 'Experience updated successfully'
  });
});

// @desc    Delete experience
// @route   DELETE /api/profile/experience/:id
// @access  Private
const deleteExperience = asyncHandler(async (req, res, next) => {
  const userId = req.user.id || req.user._id;
  const profile = await ProfessionalProfile.findOne({ user_id: userId });

  if (!profile) {
    return next(new AppError('Professional profile not found', 404));
  }

  const experience = profile.experience?.find(exp => (exp.id || exp._id) === req.params.id);

  if (!experience) {
    return next(new AppError('Experience entry not found', 404));
  }

  // Remove the experience entry
  const updatedExperience = profile.experience.filter(exp => 
    (exp.id || exp._id) !== req.params.id
  );

  await ProfessionalProfile.findByIdAndUpdate(
    profile.id,
    { experience: updatedExperience },
    { new: false }
  );

  res.status(200).json({
    success: true,
    data: updatedExperience,
    message: 'Experience deleted successfully'
  });
});

// @desc    Get public profile (for potential clients)
// @route   GET /api/profile/public/:userId
// @access  Public
const getPublicProfile = asyncHandler(async (req, res, next) => {
  const profile = await ProfessionalProfile.findOne({ user_id: req.params.userId });

  if (!profile) {
    return next(new AppError('Profile not found', 404));
  }

  // Check if profile is set to public
  const user = await User.findById(req.params.userId);
  if (!user || !user.preferences?.privacy?.showProfile) {
    return next(new AppError('Profile is private', 403));
  }

  // Return only public information
  const publicData = {
    user: {
      id: user.id || user._id,
      name: user.name,
      avatar: user.avatar,
      isVerified: user.isVerified
    },
    about: profile.about,
    therapies: profile.therapies,
    isAvailable: profile.isAvailable,
    videoPresentation: profile.videoPresentation,
    specializations: profile.specializations,
    languages: profile.languages,
    education: profile.education,
    experience: profile.experience,
    rates: profile.rates,
    workLocations: (profile.workLocations || []).map(loc => ({
      name: loc.name,
      city: loc.city,
      offersOnline: loc.offersOnline
    })),
    socialMedia: profile.socialMedia,
    stats: {
      totalSessions: profile.stats?.totalSessions,
      averageRating: profile.stats?.averageRating,
      responseTime: profile.stats?.responseTime,
      satisfactionRate: profile.stats?.satisfactionRate
    }
  };

  res.status(200).json({
    success: true,
    data: publicData
  });
});

// Helper function for recommendations
const getMissingFieldRecommendations = (missingFields) => {
  const recommendations = {
    about: 'Add a detailed description about yourself and your approach to therapy',
    therapies: 'List the types of therapy you specialize in',
    specializations: 'Add your professional specializations and certifications',
    languages: 'Specify the languages you can conduct therapy in',
    education: 'Add your educational background and qualifications',
    experience: 'Include your professional experience and previous positions',
    workLocations: 'Add your practice locations and availability',
    rates: 'Set your session rates and pricing information',
    videoPresentation: 'Upload a video introduction to help clients get to know you',
    website: 'Add your professional website or social media links'
  };

  return missingFields.map(field => ({
    field,
    recommendation: recommendations[field]
  }));
};

module.exports = {
  getProfile,
  updateProfile,
  updateStats,
  getProfileCompleteness,
  addEducation,
  updateEducation,
  deleteEducation,
  addExperience,
  updateExperience,
  deleteExperience,
  getPublicProfile
};
