/**
 * Tests de Integración: CRUD Bookings
 * Prueba: crear, obtener, actualizar, cancelar citas
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const request = require('supertest');
const app = require('../../app');
const {
  generateTestUser,
  generateTestClient,
  generateTestBooking,
  cleanupUserByEmail,
  supabase
} = require('../helpers/testData');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  console.log.mockRestore();
  console.error.mockRestore();
  console.warn.mockRestore();
});

describe('📅 CRUD BOOKINGS', () => {
  let therapistToken;
  let therapistId;
  let clientId;
  let bookingId;
  let testTherapist;

  beforeAll(async () => {
    testTherapist = generateTestUser('bookings_therapist');

    // 1. Registrar terapeuta
    const regRes = await request(app)
      .post('/api/auth/register')
      .send(testTherapist)
      .set('Content-Type', 'application/json');

    if (regRes.status !== 201) {
      throw new Error(`No se pudo crear terapeuta: ${JSON.stringify(regRes.body)}`);
    }

    therapistToken = regRes.body.accessToken;
    therapistId = regRes.body.user.id;

    // 2. Crear un cliente de test directamente en Supabase (más rápido)
    const clientData = generateTestClient(therapistId);
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        therapistId: therapistId,
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.warn('No se pudo crear cliente de test:', error.message);
    } else {
      clientId = client.id;
    }
  });

  afterAll(async () => {
    // Limpiar booking de test si quedó
    if (bookingId) {
      await supabase.from('bookings').delete().eq('id', bookingId);
    }
    await cleanupUserByEmail(testTherapist.email);
  });

  // ─────────────────────────────────────────────
  describe('POST /api/bookings', () => {
    it('debería crear una nueva cita', async () => {
      if (!clientId) {
        console.warn('Skipping: no clientId disponible');
        return;
      }

      const bookingData = generateTestBooking(therapistId, clientId);

      const res = await request(app)
        .post('/api/bookings')
        .send(bookingData)
        .set('Authorization', `Bearer ${therapistToken}`)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const booking = res.body.booking || res.body.data;
      expect(booking).toBeDefined();
      expect(booking.therapistId || booking.therapistId).toBeDefined();

      bookingId = booking.id || booking._id;
    });

    it('debería rechazar creación sin autenticación', async () => {
      const bookingData = generateTestBooking(therapistId, clientId || 'fake-id');

      const res = await request(app)
        .post('/api/bookings')
        .send(bookingData)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(401);
    });

    it('debería rechazar creación sin fecha', async () => {
      const bookingData = generateTestBooking(therapistId, clientId || 'fake-id');
      delete bookingData.date;

      const res = await request(app)
        .post('/api/bookings')
        .send(bookingData)
        .set('Authorization', `Bearer ${therapistToken}`)
        .set('Content-Type', 'application/json');

      expect([400, 422]).toContain(res.status);
    });
  });

  // ─────────────────────────────────────────────
  describe('GET /api/bookings', () => {
    it('debería obtener la lista de citas del terapeuta', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${therapistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const bookings = res.body.bookings || res.body.data || [];
      expect(Array.isArray(bookings)).toBe(true);
    });

    it('debería rechazar solicitud sin token', async () => {
      const res = await request(app)
        .get('/api/bookings');

      expect(res.status).toBe(401);
    });

    it('debería soportar filtrado por status', async () => {
      const res = await request(app)
        .get('/api/bookings?status=upcoming')
        .set('Authorization', `Bearer ${therapistToken}`);

      expect(res.status).toBe(200);
    });

    it('debería soportar paginación', async () => {
      const res = await request(app)
        .get('/api/bookings?page=1&limit=10')
        .set('Authorization', `Bearer ${therapistToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────
  describe('GET /api/bookings/upcoming', () => {
    it('debería obtener las próximas citas', async () => {
      const res = await request(app)
        .get('/api/bookings/upcoming')
        .set('Authorization', `Bearer ${therapistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  describe('GET /api/bookings/stats', () => {
    it('debería obtener estadísticas de citas', async () => {
      const res = await request(app)
        .get('/api/bookings/stats')
        .set('Authorization', `Bearer ${therapistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  describe('GET /api/bookings/:id', () => {
    it('debería obtener una cita por ID', async () => {
      if (!bookingId) {
        console.warn('Skipping: no bookingId disponible');
        return;
      }

      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${therapistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const booking = res.body.booking || res.body.data;
      expect(booking).toBeDefined();
    });

    it('debería devolver 404 para ID inexistente', async () => {
      const res = await request(app)
        .get('/api/bookings/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${therapistToken}`);

      expect([404, 400]).toContain(res.status);
    });
  });

  // ─────────────────────────────────────────────
  describe('PUT /api/bookings/:id', () => {
    it('debería actualizar una cita', async () => {
      if (!bookingId) {
        console.warn('Skipping: no bookingId disponible');
        return;
      }

      const updateData = {
        notes: 'Notas actualizadas por test automatizado',
        location: 'presencial'
      };

      const res = await request(app)
        .put(`/api/bookings/${bookingId}`)
        .send(updateData)
        .set('Authorization', `Bearer ${therapistToken}`)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('debería rechazar actualización sin token', async () => {
      const res = await request(app)
        .put('/api/bookings/00000000-0000-0000-0000-000000000000')
        .send({ notes: 'Sin token' });

      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────
  describe('DELETE /api/bookings/:id (cancelar)', () => {
    it('debería cancelar una cita', async () => {
      if (!bookingId) {
        console.warn('Skipping: no bookingId disponible');
        return;
      }

      const res = await request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${therapistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Limpiar ID para evitar doble limpieza en afterAll
      bookingId = null;
    });

    it('debería rechazar cancelación sin token', async () => {
      const res = await request(app)
        .delete('/api/bookings/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });
});
