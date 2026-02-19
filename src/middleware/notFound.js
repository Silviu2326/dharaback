const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'POST /api/auth/refresh',
        'POST /api/auth/forgot-password',
        'POST /api/auth/reset-password'
      ],
      users: [
        'GET /api/users/profile',
        'PUT /api/users/profile',
        'POST /api/users/change-password',
        'POST /api/users/upload-avatar'
      ],
      clients: [
        'GET /api/clients',
        'POST /api/clients',
        'GET /api/clients/:id',
        'PUT /api/clients/:id',
        'DELETE /api/clients/:id'
      ],
      bookings: [
        'GET /api/bookings',
        'POST /api/bookings',
        'GET /api/bookings/:id',
        'PUT /api/bookings/:id',
        'DELETE /api/bookings/:id'
      ],
      payments: [
        'GET /api/payments',
        'POST /api/payments',
        'GET /api/payments/:id',
        'POST /api/payments/:id/refund'
      ]
    }
  });
};

module.exports = { notFound };