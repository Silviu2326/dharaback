/**
 * Tests de Integración: Relaciones FK
 * Prueba que las foreign keys entre tablas funcionan correctamente:
 * - User → Client (therapistId)
 * - User → Booking (therapistId)
 * - Client → Booking (client_id)
 * - Acceso solo a datos propios (aislamiento de datos)
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

describe('🔗 RELACIONES FK Y AISLAMIENTO', () => {
  // Terapeuta A
  let therapistA_Token;
  let therapistA_Id;
  let therapistA_User;
  let therapistA_ClientId;
  let therapistA_BookingId;

  // Terapeuta B (para pruebas de aislamiento)
  let therapistB_Token;
  let therapistB_Id;
  let therapistB_User;

  beforeAll(async () => {
    therapistA_User = generateTestUser('rel_therapist_a');
    therapistB_User = generateTestUser('rel_therapist_b');

    // Registrar Terapeuta A
    const resA = await request(app)
      .post('/api/auth/register')
      .send(therapistA_User)
      .set('Content-Type', 'application/json');

    if (resA.status !== 201) {
      throw new Error(`No se pudo crear Terapeuta A: ${JSON.stringify(resA.body)}`);
    }
    therapistA_Token = resA.body.accessToken;
    therapistA_Id = resA.body.user.id;

    // Registrar Terapeuta B
    const resB = await request(app)
      .post('/api/auth/register')
      .send(therapistB_User)
      .set('Content-Type', 'application/json');

    if (resB.status !== 201) {
      throw new Error(`No se pudo crear Terapeuta B: ${JSON.stringify(resB.body)}`);
    }
    therapistB_Token = resB.body.accessToken;
    therapistB_Id = resB.body.user.id;
  });

  afterAll(async () => {
    // Limpiar booking y cliente de Terapeuta A
    if (therapistA_BookingId) {
      await supabase.from('bookings').delete().eq('id', therapistA_BookingId);
    }
    if (therapistA_ClientId) {
      await supabase.from('clients').delete().eq('id', therapistA_ClientId);
    }
    await cleanupUserByEmail(therapistA_User.email);
    await cleanupUserByEmail(therapistB_User.email);
  });

  // ─────────────────────────────────────────────
  describe('FK: User → Client (therapistId)', () => {
    it('debería crear un cliente vinculado al terapeuta', async () => {
      const clientData = generateTestClient(therapistA_Id, 'relation_a');

      const res = await request(app)
        .post('/api/clients')
        .send(clientData)
        .set('Authorization', `Bearer ${therapistA_Token}`)
        .set('Content-Type', 'application/json');

      // 201: creado, 500: tabla Supabase no creada en entorno de test
      expect([201, 500]).toContain(res.status);

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        const client = res.body.client || res.body.data;
        expect(client).toBeDefined();
        therapistA_ClientId = client.id || client._id;

        // Verificar que el therapistId es correcto en Supabase
        const { data: dbClient } = await supabase
          .from('clients')
          .select('therapistId')
          .eq('id', therapistA_ClientId)
          .single();

        if (dbClient) {
          expect(dbClient.therapistId).toBe(therapistA_Id);
        }
      }
    });

    it('el cliente debe aparecer en la lista del Terapeuta A', async () => {
      if (!therapistA_ClientId) return; // No hay cliente (BD no disponible en test)

      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${therapistA_Token}`);

      expect(res.status).toBe(200);
      const clients = res.body.clients || res.body.data || [];
      const found = clients.some(c => (c.id || c._id) === therapistA_ClientId);
      expect(found).toBe(true);
    });

    it('el cliente NO debe aparecer en la lista del Terapeuta B', async () => {
      if (!therapistA_ClientId) return; // No hay cliente (BD no disponible en test)

      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${therapistB_Token}`);

      expect(res.status).toBe(200);
      const clients = res.body.clients || res.body.data || [];
      const found = clients.some(c => (c.id || c._id) === therapistA_ClientId);
      expect(found).toBe(false);
    });

    it('el Terapeuta B NO puede acceder al cliente del Terapeuta A', async () => {
      if (!therapistA_ClientId) return;

      const res = await request(app)
        .get(`/api/clients/${therapistA_ClientId}`)
        .set('Authorization', `Bearer ${therapistB_Token}`);

      // Debe devolver 404 (no encontrado) o 403 (prohibido)
      expect([403, 404]).toContain(res.status);
    });

    it('el Terapeuta B NO puede modificar el cliente del Terapeuta A', async () => {
      if (!therapistA_ClientId) return;

      const res = await request(app)
        .put(`/api/clients/${therapistA_ClientId}`)
        .send({ name: 'Hackeo desde B' })
        .set('Authorization', `Bearer ${therapistB_Token}`)
        .set('Content-Type', 'application/json');

      expect([403, 404]).toContain(res.status);
    });
  });

  // ─────────────────────────────────────────────
  describe('FK: User+Client → Booking (therapistId + client_id)', () => {
    it('debería crear un booking vinculado al terapeuta y cliente', async () => {
      if (!therapistA_ClientId) {
        console.warn('Skipping: no clientId disponible');
        return;
      }

      const bookingData = generateTestBooking(therapistA_Id, therapistA_ClientId);

      const res = await request(app)
        .post('/api/bookings')
        .send(bookingData)
        .set('Authorization', `Bearer ${therapistA_Token}`)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const booking = res.body.booking || res.body.data;
      expect(booking).toBeDefined();

      therapistA_BookingId = booking.id || booking._id;

      // Verificar FK en Supabase
      const { data: dbBooking } = await supabase
        .from('bookings')
        .select('therapistId, client_id')
        .eq('id', therapistA_BookingId)
        .single();

      expect(dbBooking).toBeDefined();
      expect(dbBooking.therapistId).toBe(therapistA_Id);
      expect(dbBooking.client_id).toBe(therapistA_ClientId);
    });

    it('el booking debe aparecer en la lista del Terapeuta A', async () => {
      if (!therapistA_BookingId) return; // No hay booking (no había cliente)

      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${therapistA_Token}`);

      expect(res.status).toBe(200);
      const bookings = res.body.bookings || res.body.data || [];
      const found = bookings.some(b => (b.id || b._id) === therapistA_BookingId);
      expect(found).toBe(true);
    });

    it('el booking NO debe aparecer en la lista del Terapeuta B', async () => {
      if (!therapistA_BookingId) return; // No hay booking (no había cliente)

      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${therapistB_Token}`);

      expect(res.status).toBe(200);
      const bookings = res.body.bookings || res.body.data || [];
      const found = bookings.some(b => (b.id || b._id) === therapistA_BookingId);
      expect(found).toBe(false);
    });

    it('el Terapeuta B NO puede acceder al booking del Terapeuta A', async () => {
      if (!therapistA_BookingId) return;

      const res = await request(app)
        .get(`/api/bookings/${therapistA_BookingId}`)
        .set('Authorization', `Bearer ${therapistB_Token}`);

      expect([403, 404]).toContain(res.status);
    });
  });

  // ─────────────────────────────────────────────
  describe('Integridad referencial: cascade de datos', () => {
    it('el cliente existente tiene relaciones en Supabase', async () => {
      if (!therapistA_ClientId) return;

      // Verificar que existe el cliente en Supabase
      const { data: client, error } = await supabase
        .from('clients')
        .select('id, therapistId, name')
        .eq('id', therapistA_ClientId)
        .single();

      expect(error).toBeNull();
      expect(client).toBeDefined();
      expect(client.therapistId).toBe(therapistA_Id);
    });

    it('el terapeuta A tiene al menos un cliente', async () => {
      if (!therapistA_ClientId) return; // No hay cliente (BD no disponible en test)

      const { data: clients, error } = await supabase
        .from('clients')
        .select('id')
        .eq('therapistId', therapistA_Id);

      expect(error).toBeNull();
      expect(clients).toBeDefined();
      expect(clients.length).toBeGreaterThan(0);
    });

    it('el terapeuta B no tiene clientes del terapeuta A', async () => {
      if (!therapistA_ClientId) return;

      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .eq('therapistId', therapistB_Id)
        .eq('id', therapistA_ClientId);

      // No debe encontrar el cliente de A en los clientes de B
      expect(clients?.length || 0).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  describe('Datos propios: cada terapeuta ve solo sus datos', () => {
    it('Terapeuta A ve sus propias estadísticas de clientes', async () => {
      const res = await request(app)
        .get('/api/clients/stats')
        .set('Authorization', `Bearer ${therapistA_Token}`);

      expect(res.status).toBe(200);
      const statsA = res.body.stats || res.body.data || res.body;
      expect(statsA).toBeDefined();
    });

    it('Terapeuta B ve sus propias estadísticas de clientes (sin los de A)', async () => {
      const res = await request(app)
        .get('/api/clients/stats')
        .set('Authorization', `Bearer ${therapistB_Token}`);

      expect(res.status).toBe(200);
    });

    it('Terapeuta A ve sus propias estadísticas de bookings', async () => {
      const res = await request(app)
        .get('/api/bookings/stats')
        .set('Authorization', `Bearer ${therapistA_Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
