const { validationResult } = require('express-validator');
const { Payment, PayoutRequest, User, Client, Booking } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

const paymentController = {
  // Get all payments for a therapist
  async getPayments(req, res, next) {
    try {
      const therapistId = req.user.id;
      const {
        status,
        method,
        clientId,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      // Build query with Supabase
      let query = supabase
        .from('payments')
        .select('*, client:client_id(*), booking:booking_id(*)', { count: 'exact' })
        .eq('therapist_id', therapistId);

      if (status) query = query.eq('status', status);
      if (method) query = query.eq('method', method);
      if (clientId) query = query.eq('client_id', clientId);
      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);

      // Apply sorting and pagination
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      const payments = (data || []).map(p => new Payment.Payment(p));

      // Transform payments to include external client data if applicable
      const transformedPayments = payments.map(p => {
        const paymentJson = p.toJSON();
        
        // If no client but has metadata with client info (external client)
        if (!paymentJson.clientId && paymentJson.metadata?.clientName) {
          paymentJson.externalClient = {
            name: paymentJson.metadata.clientName,
            email: paymentJson.metadata.clientEmail,
            isExternal: true
          };
        }
        
        return paymentJson;
      });

      res.json({
        success: true,
        data: {
          payments: transformedPayments,
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

  // Get a specific payment
  async getPayment(req, res, next) {
    try {
      const { paymentId } = req.params;
      const therapistId = req.user.id;

      const payment = await Payment.findOne({
        id: paymentId,
        therapist_id: therapistId
      });

      if (!payment) {
        return next(new AppError('Payment not found', 404));
      }

      // Get related data
      const [client, booking, therapist] = await Promise.all([
        payment.clientId ? Client.findById(payment.clientId) : null,
        payment.bookingId ? Booking.findById(payment.bookingId) : null,
        User.findById(payment.therapistId)
      ]);

      const paymentData = payment.toJSON();
      
      // Build client data (from client table or external from metadata)
      let clientData = null;
      if (client) {
        clientData = {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          avatar: client.avatar
        };
      } else if (paymentData.metadata?.clientName) {
        // External client from metadata
        clientData = {
          name: paymentData.metadata.clientName,
          email: paymentData.metadata.clientEmail,
          isExternal: true
        };
      }

      res.json({
        success: true,
        data: {
          ...paymentData,
          client: clientData,
          booking: booking ? {
            id: booking.id,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            serviceType: booking.serviceType,
            location: booking.location
          } : null,
          therapist: therapist ? {
            id: therapist.id,
            name: therapist.name,
            email: therapist.email
          } : null
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Create a new payment
  async createPayment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const therapistId = req.user.id;
      const {
        amount,
        currency = 'EUR',
        method,
        clientId,
        bookingId,
        description,
        metadata = {},
        status: requestedStatus
      } = req.body;

      // Verify client exists (optional for external clients)
      let client = null;
      if (clientId) {
        client = await Client.findById(clientId);
        if (!client) {
          return next(new AppError('Client not found', 404));
        }
      }

      // Verify booking if provided
      let bookingObjectId = null;
      if (bookingId) {
        const booking = await Booking.findOne({
          id: bookingId,
          therapist_id: therapistId,
          client_id: clientId
        });
        if (!booking) {
          return next(new AppError('Booking not found', 404));
        }
        // Guardar el ObjectId del booking, no el string id
        bookingObjectId = booking._id || booking.id;
      }

      // Calculate fees and net amount (platform fee: 3%)
      const fees = amount * 0.03;
      const netAmount = amount - fees;

      // Determine status - allow explicit status or default to 'pending'
      const paymentStatus = requestedStatus || 'pending';
      
      const paymentData = {
        amount,
        platformFee: fees,
        netAmount,
        currency,
        method,
        clientId,
        therapistId,
        bookingId: bookingObjectId, // Usar el ObjectId, no el string
        description,
        status: paymentStatus,
        paidAt: paymentStatus === 'completed' ? new Date().toISOString() : null,
        metadata: {
          ...metadata,
          source: 'web',
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      };

      console.log('💳 Creating payment with data:', JSON.stringify(paymentData, null, 2));
      const payment = await Payment.create(paymentData);
      console.log('✅ Payment created:', payment._id?.toString(), 'bookingId:', payment.bookingId?.toString());

      res.status(201).json({
        success: true,
        data: payment.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Update payment status
  async updatePaymentStatus(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { paymentId } = req.params;
      const { status, transactionId, failureReason } = req.body;
      const therapistId = req.user.id;

      const payment = await Payment.findOne({
        id: paymentId,
        therapist_id: therapistId
      });

      if (!payment) {
        return next(new AppError('Payment not found', 404));
      }

      const updateData = { status };
      if (transactionId) updateData.transactionId = transactionId;
      if (failureReason) {
        updateData.metadata = {
          ...payment.metadata,
          failureReason
        };
      }
      if (status === 'completed') {
        updateData.paidAt = new Date().toISOString();
      }

      const updatedPayment = await Payment.findByIdAndUpdate(paymentId, updateData, { new: true });

      res.json({
        success: true,
        data: updatedPayment.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Process refund
  async processRefund(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { paymentId } = req.params;
      const { refundAmount, reason } = req.body;
      const therapistId = req.user.id;

      const payment = await Payment.findOne({
        id: paymentId,
        therapist_id: therapistId
      });

      if (!payment) {
        return next(new AppError('Payment not found', 404));
      }

      await payment.refund(refundAmount, reason);

      res.json({
        success: true,
        message: 'Refund processed successfully',
        data: payment.toJSON()
      });
    } catch (error) {
      next(error);
    }
  },

  // Get payment statistics
  async getPaymentStats(req, res, next) {
    try {
      const therapistId = req.user.id;
      const { period = 'month' } = req.query;

      // Get current period date range
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

      const stats = await Payment.getStats(therapistId, startDate.toISOString(), now.toISOString());
      const monthlyRevenue = await Payment.getMonthlyRevenue(therapistId, 12);

      res.json({
        success: true,
        data: {
          currentPeriod: stats,
          monthlyRevenue,
          period,
          dateRange: {
            startDate,
            endDate: now
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get payout requests
  async getPayoutRequests(req, res, next) {
    try {
      const therapistId = req.user.id;
      const {
        status,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      let query = supabase
        .from('payout_requests')
        .select('*', { count: 'exact' })
        .eq('therapist_id', therapistId);

      if (status) query = query.eq('status', status);

      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: {
          payoutRequests: data || [],
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

  // Create payout request
  async createPayoutRequest(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const therapistId = req.user.id;
      const {
        amount,
        currency = 'EUR',
        bankAccount,
        notes
      } = req.body;

      // Check minimum payout amount
      if (amount < 1) {
        return next(new AppError('Minimum payout amount is €1', 400));
      }

      // Check if therapist has sufficient available balance
      const availableBalance = await paymentController.getAvailableBalance(therapistId);
      if (amount > availableBalance) {
        return next(new AppError('Insufficient available balance', 400));
      }

      // Check for pending payout requests
      const { count: pendingCount } = await supabase
        .from('payout_requests')
        .select('*', { count: 'exact', head: true })
        .eq('therapist_id', therapistId)
        .in('status', ['pending', 'processing']);

      if (pendingCount > 0) {
        return next(new AppError('You have pending payout requests. Please wait for them to be processed.', 400));
      }

      const payoutRequest = await PayoutRequest.create({
        therapistId,
        amount,
        currency,
        bankAccount,
        notes
      });

      res.status(201).json({
        success: true,
        data: payoutRequest
      });
    } catch (error) {
      next(error);
    }
  },

  // Get balance summary
  async getBalanceSummary(req, res, next) {
    try {
      const therapistId = req.user.id;

      const availableBalance = await paymentController.getAvailableBalance(therapistId);

      // Get pending amount
      const { data: pendingData } = await supabase
        .from('payout_requests')
        .select('amount')
        .eq('therapist_id', therapistId)
        .in('status', ['pending', 'processing']);

      const pendingAmount = (pendingData || []).reduce((sum, p) => sum + p.amount, 0);

      // Get total earnings this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const monthlyStats = await Payment.getStats(therapistId, startOfMonth.toISOString(), now.toISOString());

      res.json({
        success: true,
        data: {
          availableBalance,
          pendingAmount,
          monthlyEarnings: monthlyStats.totalNetAmount || 0,
          currency: 'EUR'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Helper: Get available balance for therapist
  async getAvailableBalance(therapistId) {
    // Calculate total completed payments
    const { data: completedPayments } = await supabase
      .from('payments')
      .select('net_amount')
      .eq('therapist_id', therapistId)
      .eq('status', 'completed');

    // Calculate total completed payouts
    const { data: completedPayouts } = await supabase
      .from('payout_requests')
      .select('amount')
      .eq('therapist_id', therapistId)
      .eq('status', 'completed');

    // Calculate pending payouts
    const { data: pendingPayouts } = await supabase
      .from('payout_requests')
      .select('amount')
      .eq('therapist_id', therapistId)
      .in('status', ['pending', 'processing']);

    const totalEarnings = (completedPayments || []).reduce((sum, p) => sum + parseFloat(p.net_amount || 0), 0);
    const totalPayouts = (completedPayouts || []).reduce((sum, p) => sum + p.amount, 0);
    const totalPending = (pendingPayouts || []).reduce((sum, p) => sum + p.amount, 0);

    return Math.max(0, totalEarnings - totalPayouts - totalPending);
  },

  // Get payment providers
  getProviders: async (req, res, next) => {
    try {
      const providers = [
        {
          id: 'stripe',
          name: 'Stripe',
          type: 'card',
          supported: true,
          fees: { percentage: 2.9, fixed: 0.30, currency: 'EUR' },
          methods: ['visa', 'mastercard', 'amex'],
          features: ['refunds', 'disputes', 'subscriptions']
        },
        {
          id: 'paypal',
          name: 'PayPal',
          type: 'digital_wallet',
          supported: true,
          fees: { percentage: 3.4, fixed: 0.35, currency: 'EUR' },
          methods: ['paypal_balance', 'linked_bank', 'linked_card'],
          features: ['refunds', 'disputes', 'buyer_protection']
        },
        {
          id: 'bank_transfer',
          name: 'Bank Transfer',
          type: 'bank_transfer',
          supported: true,
          fees: { percentage: 0, fixed: 1.50, currency: 'EUR' },
          methods: ['sepa', 'wire_transfer'],
          features: ['large_amounts', 'low_fees']
        },
        {
          id: 'cash',
          name: 'Cash',
          type: 'cash',
          supported: true,
          fees: { percentage: 0, fixed: 0, currency: 'EUR' },
          methods: ['in_person'],
          features: ['immediate', 'no_fees']
        }
      ];

      res.json({
        success: true,
        data: providers
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's payment methods from Stripe
  async getPaymentMethods(req, res, next) {
    try {
      const userId = req.user.id;
      console.log('🔍 [getPaymentMethods] User ID:', userId);
      
      const { supabase } = require('../config/supabase');
      const stripeService = require('../services/stripeService');

      // Obtener el usuario de Supabase para obtener el stripe_customer_id
      console.log('📡 [getPaymentMethods] Fetching user from Supabase...');
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, name, stripe_customer_id')
        .eq('id', userId)
        .single();

      console.log('👤 [getPaymentMethods] User data:', JSON.stringify(user, null, 2));
      console.log('❌ [getPaymentMethods] User error:', userError);

      if (userError || !user) {
        console.log('⚠️ [getPaymentMethods] User not found');
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Si no tiene stripe_customer_id, devolver array vacío
      if (!user.stripe_customer_id) {
        console.log('⚠️ [getPaymentMethods] No stripe_customer_id found for user');
        return res.json({
          success: true,
          data: {
            methods: [],
            defaultMethod: null,
            hasPaymentMethods: false,
            message: 'No stripe_customer_id found'
          }
        });
      }

      console.log('💳 [getPaymentMethods] Stripe Customer ID:', user.stripe_customer_id);

      // Obtener métodos de pago de Stripe
      let paymentMethods = [];
      let defaultMethod = null;

      try {
        console.log('📡 [getPaymentMethods] Fetching payment methods from Stripe...');
        // Obtener todos los métodos de pago
        paymentMethods = await stripeService.getPaymentMethods(user.stripe_customer_id);
        console.log('✅ [getPaymentMethods] Payment methods from Stripe:', JSON.stringify(paymentMethods, null, 2));
        
        // Obtener el método por defecto
        console.log('📡 [getPaymentMethods] Fetching default payment method...');
        defaultMethod = await stripeService.getDefaultPaymentMethod(user.stripe_customer_id);
        console.log('✅ [getPaymentMethods] Default method:', JSON.stringify(defaultMethod, null, 2));
      } catch (stripeError) {
        console.error('❌ [getPaymentMethods] Error fetching from Stripe:', stripeError.message);
        console.error('❌ [getPaymentMethods] Stripe error details:', stripeError);
        // Si falla Stripe, continuamos con array vacío
      }

      // Si hay un método por defecto, marcarlo en la lista
      if (defaultMethod && paymentMethods.length > 0) {
        paymentMethods = paymentMethods.map(method => ({
          ...method,
          isDefault: method.id === defaultMethod.id
        }));
      }

      // Si no hay método marcado como default pero hay métodos, marcar el primero
      if (!defaultMethod && paymentMethods.length > 0) {
        paymentMethods[0].isDefault = true;
        defaultMethod = paymentMethods[0];
      }

      const responseData = {
        success: true,
        data: {
          methods: paymentMethods,
          defaultMethod: defaultMethod,
          hasPaymentMethods: paymentMethods.length > 0,
          customerId: user.stripe_customer_id
        }
      };

      console.log('📤 [getPaymentMethods] Sending response:', JSON.stringify(responseData, null, 2));
      console.log('📊 [getPaymentMethods] Response size:', JSON.stringify(responseData).length, 'bytes');

      res.json(responseData);
    } catch (error) {
      console.error('❌ [getPaymentMethods] Error getting payment methods:', error);
      next(error);
    }
  },

  // CLIENT PAYMENT FUNCTIONS

  // Get all payments for a client
  async getClientPayments(req, res, next) {
    try {
      const clientId = req.user.id;
      const {
        status,
        method,
        therapistId,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      let query = supabase
        .from('payments')
        .select('*, therapist:therapist_id(*), booking:booking_id(*)', { count: 'exact' })
        .eq('client_id', clientId);

      if (status) query = query.eq('status', status);
      if (method) query = query.eq('method', method);
      if (therapistId) query = query.eq('therapist_id', therapistId);
      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);

      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      const payments = (data || []).map(p => new Payment.Payment(p));

      res.json({
        success: true,
        data: {
          payments: payments.map(p => p.toJSON()),
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

  // Get a specific payment for client
  async getClientPayment(req, res, next) {
    try {
      const { paymentId } = req.params;
      const clientId = req.user.id;

      const payment = await Payment.findOne({
        id: paymentId,
        therapist_id: therapistId
      });

      if (!payment) {
        return next(new AppError('Payment not found', 404));
      }

      const [therapist, booking] = await Promise.all([
        User.findById(payment.therapistId),
        payment.bookingId ? Booking.findById(payment.bookingId) : null
      ]);

      res.json({
        success: true,
        data: {
          ...payment.toJSON(),
          therapist: therapist ? {
            id: therapist.id,
            name: therapist.name,
            email: therapist.email,
            specialties: therapist.specialties,
            avatar: therapist.avatar
          } : null,
          booking: booking ? {
            id: booking.id,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            serviceType: booking.serviceType,
            location: booking.location
          } : null
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get client payment summary
  async getClientPaymentSummary(req, res, next) {
    try {
      const clientId = req.user.id;

      // Get total spent
      const { data: completedPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('client_id', clientId)
        .eq('status', 'completed');

      // Get spending this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data: monthlyPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .gte('created_at', startOfMonth.toISOString());

      // Get pending payments count
      const { count: pendingCount } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'pending');

      // Get recent payments
      const { data: recentPayments } = await supabase
        .from('payments')
        .select('*, therapist:therapist_id(name, specialties)')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5);

      const totalSpent = (completedPayments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const monthlySpent = (monthlyPayments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);

      res.json({
        success: true,
        data: {
          totalSpent,
          totalPayments: completedPayments?.length || 0,
          monthlySpent,
          monthlyPayments: monthlyPayments?.length || 0,
          pendingPayments: pendingCount || 0,
          recentPayments: recentPayments || [],
          currency: 'EUR'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete a payment
  async deletePayment(req, res, next) {
    try {
      const { paymentId } = req.params;
      const therapistId = req.user.id;

      // Find the payment
      const payment = await Payment.findOne({
        id: paymentId,
        therapist_id: therapistId
      });

      if (!payment) {
        return next(new AppError('Payment not found', 404));
      }

      // Delete the payment
      await Payment.delete(paymentId);

      res.json({
        success: true,
        message: 'Cobro eliminado correctamente'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = paymentController;
