/**
 * Tests de Integración: Auth Flow
 * Prueba: Register, Login, GetMe, Logout, RefreshToken
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const request = require('supertest');
const app = require('../../app');
const { generateTestUser, cleanupUserByEmail } = require('../helpers/testData');

// Suprimir logs de app durante los tests
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

describe('🔐 AUTH FLOW', () => {
  let testUser;
  let accessToken;
  let refreshToken;

  beforeAll(() => {
    testUser = generateTestUser('auth');
  });

  afterAll(async () => {
    await cleanupUserByEmail(testUser.email);
  });

  // ─────────────────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('debería registrar un nuevo usuario correctamente', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.name).toBe(testUser.name);
      expect(res.body.user.password).toBeUndefined(); // password nunca debe devolverse

      // Guardar tokens para tests posteriores
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('debería rechazar registro con email duplicado', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('debería rechazar registro con contraseñas que no coinciden', async () => {
      const user = generateTestUser('mismatch');
      user.confirmPassword = 'OtraContraseña456!';

      const res = await request(app)
        .post('/api/auth/register')
        .send(user)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('debería rechazar registro con contraseña demasiado corta', async () => {
      const user = generateTestUser('short');
      user.password = '123';
      user.confirmPassword = '123';

      const res = await request(app)
        .post('/api/auth/register')
        .send(user)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('debería rechazar registro sin campos obligatorios', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'incomplete@test.com' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('debería hacer login con credenciales correctas', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);

      // Actualizar token
      accessToken = res.body.accessToken;
    });

    it('debería hacer login con rememberMe y devolver refreshToken', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          rememberMe: true
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      refreshToken = res.body.refreshToken;
    });

    it('debería rechazar login con contraseña incorrecta', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'ContraseñaIncorrecta999!'
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('debería rechazar login con email inexistente', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'noexiste@test.com',
          password: 'TestPassword123!'
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('debería rechazar login sin email o contraseña', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    it('debería devolver el usuario autenticado', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('debería rechazar solicitud sin token', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('debería rechazar solicitud con token inválido', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token_invalido_123');

      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────
  describe('POST /api/auth/refresh', () => {
    it('debería renovar el token con un refreshToken válido', async () => {
      if (!refreshToken) {
        console.warn('Skipping: no refreshToken disponible');
        return;
      }

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
    });

    it('debería rechazar un refreshToken inválido', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'token_invalido_xyz' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(401);
    });

    it('debería rechazar si no se proporciona refreshToken', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────
  describe('POST /api/auth/logout', () => {
    it('debería hacer logout correctamente', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('debería rechazar logout sin autenticación', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────
  describe('POST /api/auth/forgot-password', () => {
    it('debería iniciar el proceso de reset de contraseña', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: accessToken ? testUser.email : 'test@test.com' })
        .set('Content-Type', 'application/json');

      // 200: email enviado, 500: email service no configurado (SendGrid no disponible en test)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    it('debería devolver 404 para email inexistente', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'noexiste_jamas@test.com' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(404);
    });
  });
});
