const { validationResult } = require('express-validator');
const { Subscription, SubscriptionPlan, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');

// Mock data para migración temporal
const MOCK_SUBSCRIPTION_DATA = {
  'professional': {
    max_clients: 100,
    max_sessions_per_month: 200,
    max_storage_gb: 10,
    max_team_members: 3,
    max_locations: 2,
    can_add_videos: true,
    can_add_prices: true,
    can_access_analytics: true,
    has_priority_support: true
  },
  'basic': {
    max_clients: 50,
    max_sessions_per_month: 100,
    max_storage_gb: 5,
    max_team_members: 1,
    max_locations: 1,
    can_add_videos: false,
    can_add_prices: false,
    can_access_analytics: false,
    has_priority_support: false
  },
  'enterprise': {
    max_clients: -1,
    max_sessions_per_month: -1,
    max_storage_gb: 100,
    max_team_members: 10,
    max_locations: 10,
    can_add_videos: true,
    can_add_prices: true,
    can_access_analytics: true,
    has_priority_support: true,
    has_api_access: true
  }
};

const subscriptionController = {
  // Obtener todas las suscripciones del usuario
  async getSubscriptions(req, res, next) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 20 } = req.query;

      let query = supabase
        .from('subscriptions')
        .select('*, plan:plan_id(*)', { count: 'exact' })
        .eq('user_id', userId);

      if (status) query = query.eq('status', status);

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.order('created_at', { ascending: false })
                   .range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: {
          subscriptions: data || [],
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

  // Obtener suscripción actual
  async getCurrentSubscription(req, res, next) {
    try {
      const userId = req.user.id;

      const subscription = await Subscription.findActiveSubscription(userId);

      if (!subscription) {
        return res.json({
          success: true,
          data: null
        });
      }

      // Obtener plan details
      const plan = await SubscriptionPlan.findById(subscription.planId);

      res.json({
        success: true,
        data: {
          ...subscription,
          plan: plan || null,
          limits: MOCK_SUBSCRIPTION_DATA[plan?.type || 'basic']
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Crear nueva suscripción
  async createSubscription(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const userId = req.user.id;
      const { planId, billingCycle = 'monthly', paymentMethodId } = req.body;

      // Verificar que el plan existe
      const plan = await SubscriptionPlan.findById(planId);
      if (!plan) {
        return next(new AppError('Subscription plan not found', 404));
      }

      // Verificar si ya tiene una suscripción activa
      const existingSubscription = await Subscription.findActiveSubscription(userId);
      if (existingSubscription) {
        return next(new AppError('You already have an active subscription', 400));
      }

      const now = new Date();
      const endDate = new Date(now);
      if (billingCycle === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      const subscriptionData = {
        userId,
        planId,
        status: 'active',
        billingCycle,
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
        price: plan.price,
        currency: plan.currency || 'EUR',
        features: plan.features || {},
        paymentMethodId
      };

      const subscription = await Subscription.create(subscriptionData);

      // Update user subscription tier
      await User.findByIdAndUpdate(userId, { subscriptionTier: plan.type });

      res.status(201).json({
        success: true,
        data: subscription
      });
    } catch (error) {
      next(error);
    }
  },

  // Cancelar suscripción
  async cancelSubscription(req, res, next) {
    try {
      const { subscriptionId } = req.params;
      const userId = req.user.id;

      const subscription = await Subscription.findOne({
        id: subscriptionId,
        user_id: userId
      });

      if (!subscription) {
        return next(new AppError('Subscription not found', 404));
      }

      const updatedSubscription = await Subscription.findByIdAndUpdate(subscriptionId, {
        status: 'canceled',
        cancelAtPeriodEnd: true,
        canceledAt: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updatedSubscription
      });
    } catch (error) {
      next(error);
    }
  },

  // Suspender suscripción
  async suspendSubscription(req, res, next) {
    try {
      const { subscriptionId } = req.params;
      const userId = req.user.id;

      const subscription = await Subscription.findOne({
        id: subscriptionId,
        user_id: userId
      });

      if (!subscription) {
        return next(new AppError('Subscription not found', 404));
      }

      const updatedSubscription = await Subscription.findByIdAndUpdate(subscriptionId, {
        status: 'suspended',
        suspendedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updatedSubscription
      });
    } catch (error) {
      next(error);
    }
  },

  // Reactivar suscripción
  async reactivateSubscription(req, res, next) {
    try {
      const { subscriptionId } = req.params;
      const userId = req.user.id;

      const subscription = await Subscription.findOne({
        id: subscriptionId,
        user_id: userId
      });

      if (!subscription) {
        return next(new AppError('Subscription not found', 404));
      }

      const updatedSubscription = await Subscription.findByIdAndUpdate(subscriptionId, {
        status: 'active',
        reactivatedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        data: updatedSubscription
      });
    } catch (error) {
      next(error);
    }
  },

  // Cambiar de plan (upgrade/downgrade)
  async changePlan(req, res, next) {
    try {
      const { subscriptionId } = req.params;
      const userId = req.user.id;
      const { newPlanId, effectiveImmediately = false } = req.body;

      const subscription = await Subscription.findOne({
        id: subscriptionId,
        user_id: userId
      });

      if (!subscription) {
        return next(new AppError('Subscription not found', 404));
      }

      const newPlan = await SubscriptionPlan.findById(newPlanId);
      if (!newPlan) {
        return next(new AppError('New plan not found', 404));
      }

      // Update subscription
      const updateData = {
        planId: newPlanId,
        previousPlanId: subscription.planId,
        price: newPlan.price
      };

      if (effectiveImmediately) {
        updateData.startDate = new Date().toISOString();
        const endDate = new Date();
        if (subscription.billingCycle === 'monthly') {
          endDate.setMonth(endDate.getMonth() + 1);
        } else {
          endDate.setFullYear(endDate.getFullYear() + 1);
        }
        updateData.endDate = endDate.toISOString();
      }

      const updatedSubscription = await Subscription.findByIdAndUpdate(subscriptionId, updateData);

      // Update user tier
      await User.findByIdAndUpdate(userId, { subscriptionTier: newPlan.type });

      res.json({
        success: true,
        data: updatedSubscription
      });
    } catch (error) {
      next(error);
    }
  },

  // Verificar límites de uso
  async checkLimits(req, res, next) {
    try {
      const userId = req.user.id;
      const { limitType } = req.params;

      const result = await Subscription.checkLimit(userId, limitType);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener uso actual
  async getUsage(req, res, next) {
    try {
      const userId = req.user.id;

      const subscription = await Subscription.findActiveSubscription(userId);
      if (!subscription) {
        return res.json({
          success: true,
          data: null
        });
      }

      const { data: usage } = await supabase
        .from('subscription_usage')
        .select('*')
        .eq('subscription_id', subscription.id)
        .single();

      res.json({
        success: true,
        data: usage || {
          clientsCount: 0,
          sessionsThisMonth: 0,
          storageUsed: 0,
          teamMembers: 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener estadísticas de suscripción (admin)
  async getSubscriptionStats(req, res, next) {
    try {
      const { 
        groupBy = 'plan',
        startDate,
        endDate 
      } = req.query;

      const { data: stats } = await supabase
        .from('subscriptions')
        .select('*');

      if (groupBy === 'plan') {
        const grouped = (stats || []).reduce((acc, sub) => {
          acc[sub.plan_id] = (acc[sub.plan_id] || 0) + 1;
          return acc;
        }, {});

        res.json({
          success: true,
          data: { grouped }
        });
      } else {
        const statusStats = (stats || []).reduce((acc, sub) => {
          acc[sub.status] = (acc[sub.status] || 0) + 1;
          return acc;
        }, {});

        res.json({
          success: true,
          data: { grouped: statusStats }
        });
      }
    } catch (error) {
      next(error);
    }
  },

  // Obtener planes disponibles
  async getPlans(req, res, next) {
    try {
      const { active = 'true' } = req.query;

      let query = supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', active === 'true')
        .order('price', { ascending: true });

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener datos de payout basado en pagos reales de la tabla payments
  async getPayoutData(req, res, next) {
    try {
      const userId = req.user.id;

      // Calcular saldo disponible basado en pagos completados
      const { data: completedPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('net_amount, platform_fee')
        .eq('therapist_id', userId)
        .eq('status', 'completed');

      if (paymentsError) throw new Error(paymentsError.message);

      // Calcular total de pagos completados (net_amount ya tiene la comisión descontada)
      const totalEarnings = (completedPayments || []).reduce((sum, p) => {
        return sum + parseFloat(p.net_amount || 0);
      }, 0);

      // Obtener transferencias ya realizadas (completadas)
      const { data: completedPayouts, error: completedError } = await supabase
        .from('payout_requests')
        .select('amount')
        .eq('therapist_id', userId)
        .eq('status', 'completed');

      if (completedError) throw new Error(completedError.message);

      const totalPayouts = (completedPayouts || []).reduce((sum, p) => {
        return sum + parseFloat(p.amount || 0);
      }, 0);

      // Obtener transferencias pendientes
      const { data: pendingPayouts, error: pendingError } = await supabase
        .from('payout_requests')
        .select('amount')
        .eq('therapist_id', userId)
        .in('status', ['pending', 'processing']);

      if (pendingError) throw new Error(pendingError.message);

      const pendingAmount = (pendingPayouts || []).reduce((sum, p) => {
        return sum + parseFloat(p.amount || 0);
      }, 0);

      // Calcular saldo disponible
      const availableBalance = Math.max(0, totalEarnings - totalPayouts - pendingAmount);

      // Obtener historial de transferencias para mostrar en la tabla
      const { data: payoutHistory, error: historyError } = await supabase
        .from('payout_requests')
        .select('*')
        .eq('therapist_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (historyError) throw new Error(historyError.message);

      // Formatear historial para el frontend
      const formattedHistory = (payoutHistory || []).map(payout => ({
        id: payout.id,
        date: payout.created_at,
        amount: parseFloat(payout.amount || 0),
        status: payout.status === 'completed' ? 'completed' : 
                payout.status === 'pending' ? 'pending' : 
                payout.status === 'processing' ? 'pending' : 'failed',
        type: payout.type || 'automatic',
        method: payout.method || 'bank_transfer',
        reference: payout.reference || `PAY-${payout.id?.slice(0, 8)}`
      }));

      // Calcular próxima fecha de transferencia automática (día 15 del mes siguiente si hay saldo)
      let nextPayoutDate = null;
      if (availableBalance >= 10) {
        const now = new Date();
        const currentDay = now.getDate();
        if (currentDay < 15) {
          // Este mes, día 15
          nextPayoutDate = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
        } else {
          // Mes siguiente, día 15
          nextPayoutDate = new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString();
        }
      }

      // Verificar si puede solicitar transferencia inmediata
      const canRequestImmediate = availableBalance >= 10;

      res.json({
        success: true,
        data: {
          availableBalance: Math.round(availableBalance * 100) / 100,
          nextPayoutDate,
          canRequestImmediate,
          minimumPayout: 10,
          processingDays: 2,
          payoutHistory: formattedHistory,
          totalEarnings: Math.round(totalEarnings * 100) / 100,
          totalPayouts: Math.round(totalPayouts * 100) / 100,
          pendingPayouts: Math.round(pendingAmount * 100) / 100,
          currency: 'EUR'
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = subscriptionController;
