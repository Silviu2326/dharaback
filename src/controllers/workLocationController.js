const { WorkLocation, User } = require('../models');
const { validationResult } = require('express-validator');

// Get work locations with filters and pagination
const getWorkLocations = async (req, res) => {
  try {
    const {
      therapistId,
      locationType,
      status = 'active',
      city,
      postalCode,
      latitude,
      longitude,
      maxDistance = 50,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    // Build filters
    const filters = {};
    const userId = req.user.id || req.user._id;

    // Access control
    if (req.user.role === 'therapist') {
      filters.therapist_id = userId;
    } else if (therapistId && req.user.role === 'admin') {
      filters.therapist_id = therapistId;
    }

    if (locationType) filters.location_type = locationType;
    // Nota: la tabla work_locations no tiene columna 'status' en Supabase
    // Si se añade la columna, descomentar: if (status) filters.status = status;
    
    // City search - will filter in memory if needed
    let cityFilter = null;
    if (city) {
      cityFilter = city.toLowerCase();
    }

    let result;

    // Handle geographic search
    if (latitude && longitude) {
      const nearbyLocations = await WorkLocation.findNearby(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(maxDistance)
      );

      return res.json({
        success: true,
        data: nearbyLocations.map(loc => loc.toJSON()),
        pagination: null
      });
    }

    // Regular query with pagination
    const paginatedResult = await WorkLocation.paginate({
      page: parseInt(page),
      limit: parseInt(limit),
      filters,
      order: { column: sortBy, ascending: sortOrder === 'asc' }
    });

    // Filter by city if needed (case insensitive)
    let locations = paginatedResult.data;
    if (cityFilter) {
      locations = locations.filter(loc => 
        loc.city?.toLowerCase().includes(cityFilter)
      );
    }

    // Get therapist data for each location
    const locationsWithTherapists = await Promise.all(
      locations.map(async (location) => {
        try {
          const therapist = await User.findById(location.therapistId);
          return {
            ...location.toJSON(),
            therapist: therapist ? {
              id: therapist.id || therapist._id,
              name: therapist.name,
              email: therapist.email
            } : null
          };
        } catch (err) {
          return location.toJSON();
        }
      })
    );

    res.json({
      success: true,
      data: locationsWithTherapists,
      pagination: {
        currentPage: paginatedResult.pagination.page,
        totalPages: paginatedResult.pagination.totalPages,
        totalDocs: paginatedResult.pagination.total,
        hasNextPage: paginatedResult.pagination.page < paginatedResult.pagination.totalPages,
        hasPrevPage: paginatedResult.pagination.page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching work locations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching work locations',
      error: error.message
    });
  }
};

// Create new work location
const createWorkLocation = async (req, res) => {
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
    const locationData = {
      ...req.body,
      therapistId: userId
    };

    const workLocation = await WorkLocation.create(locationData);

    // Get therapist data
    const therapist = await User.findById(userId);

    res.status(201).json({
      success: true,
      message: 'Work location created successfully',
      data: {
        ...workLocation.toJSON(),
        therapist: therapist ? {
          id: therapist.id || therapist._id,
          name: therapist.name,
          email: therapist.email
        } : null
      }
    });
  } catch (error) {
    console.error('Error creating work location:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating work location',
      error: error.message
    });
  }
};

// Get single work location
const getWorkLocation = async (req, res) => {
  try {
    const { locationId } = req.params;

    const workLocation = await WorkLocation.findById(locationId);

    if (!workLocation) {
      return res.status(404).json({
        success: false,
        message: 'Work location not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role === 'therapist' && workLocation.therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get therapist data
    const therapist = await User.findById(workLocation.therapistId);

    res.json({
      success: true,
      data: {
        ...workLocation.toJSON(),
        therapist: therapist ? {
          id: therapist.id || therapist._id,
          name: therapist.name,
          email: therapist.email
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching work location:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching work location',
      error: error.message
    });
  }
};

// Update work location
const updateWorkLocation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { locationId } = req.params;
    const updates = req.body;

    const workLocation = await WorkLocation.findById(locationId);

    if (!workLocation) {
      return res.status(404).json({
        success: false,
        message: 'Work location not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role !== 'admin' && workLocation.therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Apply updates
    const updatedLocation = await WorkLocation.findByIdAndUpdate(
      locationId,
      updates,
      { new: true }
    );

    // Get therapist data
    const therapist = await User.findById(updatedLocation.therapistId);

    res.json({
      success: true,
      message: 'Work location updated successfully',
      data: {
        ...updatedLocation.toJSON(),
        therapist: therapist ? {
          id: therapist.id || therapist._id,
          name: therapist.name,
          email: therapist.email
        } : null
      }
    });
  } catch (error) {
    console.error('Error updating work location:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating work location',
      error: error.message
    });
  }
};

// Delete work location
const deleteWorkLocation = async (req, res) => {
  try {
    const { locationId } = req.params;

    const workLocation = await WorkLocation.findById(locationId);

    if (!workLocation) {
      return res.status(404).json({
        success: false,
        message: 'Work location not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role !== 'admin' && workLocation.therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if this is the only location for the therapist
    const locationCount = await WorkLocation.countByTherapist(workLocation.therapistId);

    if (locationCount === 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the only active location. Create another location first.'
      });
    }

    await WorkLocation.findByIdAndDelete(locationId);

    res.json({
      success: true,
      message: 'Work location deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting work location:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting work location',
      error: error.message
    });
  }
};

// Set location as primary
const setPrimaryLocation = async (req, res) => {
  try {
    const { locationId } = req.params;

    const workLocation = await WorkLocation.findById(locationId);

    if (!workLocation) {
      return res.status(404).json({
        success: false,
        message: 'Work location not found'
      });
    }

    // Check permissions
    const userId = req.user.id || req.user._id;
    if (req.user.role !== 'admin' && workLocation.therapistId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await workLocation.setPrimary();

    res.json({
      success: true,
      message: 'Location set as primary successfully',
      data: workLocation.toJSON()
    });
  } catch (error) {
    console.error('Error setting primary location:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting primary location',
      error: error.message
    });
  }
};

// Get locations by therapist
const getLocationsByTherapist = async (req, res) => {
  try {
    // Get therapist ID from params or query, or default to current user
    let targetTherapistId = req.params.therapistId || req.query.therapist_id;

    // If 'current' is passed or no ID specified, use current user's ID
    const userId = req.user.id || req.user._id;
    if (targetTherapistId === 'current' || !targetTherapistId) {
      targetTherapistId = userId;
    }

    const { status = 'active' } = req.query;

    // Check permissions - therapists can only access their own locations
    if (req.user.role === 'therapist' && userId !== targetTherapistId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // No filtrar por status en BD (columna puede no existir), filtramos en memoria
    const locations = await WorkLocation.findByTherapist(targetTherapistId, {});

    res.json({
      success: true,
      data: locations.map(loc => loc.toJSON())
    });
  } catch (error) {
    console.error('Error fetching locations by therapist:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching locations by therapist',
      error: error.message
    });
  }
};

// Find nearby locations
const findNearbyLocations = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 50 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const nearbyLocations = await WorkLocation.findNearby(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(maxDistance)
    );

    // Calculate actual distances
    const locationsWithDistance = nearbyLocations.map(location => {
      const distance = location.distanceTo(parseFloat(latitude), parseFloat(longitude));
      return {
        ...location.toJSON(),
        distance: distance ? Math.round(distance * 100) / 100 : null
      };
    });

    res.json({
      success: true,
      data: {
        searchCenter: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
        maxDistance: parseFloat(maxDistance),
        locations: locationsWithDistance,
        count: locationsWithDistance.length
      }
    });
  } catch (error) {
    console.error('Error finding nearby locations:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding nearby locations',
      error: error.message
    });
  }
};

// Calculate distance between locations
const calculateDistance = async (req, res) => {
  try {
    const { locationId } = req.params;
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const workLocation = await WorkLocation.findById(locationId);

    if (!workLocation) {
      return res.status(404).json({
        success: false,
        message: 'Work location not found'
      });
    }

    const distance = workLocation.distanceTo(parseFloat(latitude), parseFloat(longitude));

    res.json({
      success: true,
      data: {
        location: workLocation.name,
        fullAddress: workLocation.fullAddress,
        distance: distance ? Math.round(distance * 100) / 100 : null,
        unit: 'km'
      }
    });
  } catch (error) {
    console.error('Error calculating distance:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating distance',
      error: error.message
    });
  }
};

module.exports = {
  getWorkLocations,
  createWorkLocation,
  getWorkLocation,
  updateWorkLocation,
  deleteWorkLocation,
  setPrimaryLocation,
  getLocationsByTherapist,
  findNearbyLocations,
  calculateDistance
};
