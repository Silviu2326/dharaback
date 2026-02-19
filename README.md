# Dharaterapeutas Backend API

Backend API para la plataforma Dharaterapeutas - Sistema de gestión para terapeutas profesionales.

## 🚀 Características

- **Autenticación JWT** con refresh tokens
- **Sistema de roles** (terapeutas y administradores)
- **Gestión completa de clientes** y sesiones
- **Sistema de pagos** integrado
- **Chat en tiempo real** entre terapeutas y clientes
- **Gestión de documentos** y materiales
- **Sistema de reseñas** y valoraciones
- **Planes terapéuticos** personalizables
- **Integraciones** con calendarios externos
- **Notificaciones** en tiempo real

## 🛠️ Tecnologías

- **Node.js** & **Express.js**
- **MongoDB** con **Mongoose**
- **JWT** para autenticación
- **Bcrypt** para encriptación de contraseñas
- **Multer** para subida de archivos
- **Helmet** para seguridad
- **CORS** configurado
- **Rate limiting** implementado

## 📁 Estructura del Proyecto

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # Configuración de MongoDB
│   ├── controllers/
│   │   └── authController.js    # Controladores de autenticación
│   ├── middleware/
│   │   ├── auth.js              # Middleware de autenticación
│   │   ├── errorHandler.js      # Manejo global de errores
│   │   └── notFound.js          # Middleware para rutas no encontradas
│   ├── models/
│   │   ├── User.js              # Modelo de usuario/terapeuta
│   │   ├── Client.js            # Modelo de cliente
│   │   ├── Booking.js           # Modelo de reservas
│   │   └── Payment.js           # Modelo de pagos
│   ├── routes/
│   │   ├── authRoutes.js        # Rutas de autenticación
│   │   ├── clientRoutes.js      # Rutas de clientes
│   │   ├── bookingRoutes.js     # Rutas de reservas
│   │   └── ...                  # Más rutas
│   ├── services/               # Servicios de negocio
│   ├── utils/                  # Utilidades
│   ├── app.js                  # Configuración de Express
│   └── server.js               # Punto de entrada
├── uploads/                    # Archivos subidos
│   ├── documents/
│   ├── avatars/
│   └── banners/
├── .env.example               # Variables de entorno de ejemplo
└── package.json
```

## 🚀 Instalación y Configuración

### 1. Clonar y instalar dependencias

```bash
cd backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus configuraciones:

```env
# Configuración del servidor
PORT=5000
NODE_ENV=development

# Base de datos
MONGODB_URI=mongodb://localhost:27017/dharaterapeutas

# JWT
JWT_SECRET=tu_clave_secreta_muy_segura
JWT_EXPIRE=7d

# Email (para notificaciones)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASS=tu_contraseña_de_aplicacion

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### 3. Iniciar MongoDB

Asegúrate de tener MongoDB ejecutándose:

```bash
# Con Docker
docker run -d -p 27017:27017 --name mongodb mongo

# O instalación local
mongod
```

### 4. Ejecutar el servidor

```bash
# Desarrollo (con nodemon)
npm run dev

# Producción
npm start
```

El servidor se ejecutará en `http://localhost:5000`

## 📚 API Endpoints

### Autenticación

```
POST /api/auth/register     # Registrar usuario
POST /api/auth/login        # Iniciar sesión
POST /api/auth/logout       # Cerrar sesión
GET  /api/auth/me          # Obtener usuario actual
POST /api/auth/refresh     # Renovar token
POST /api/auth/forgot-password  # Recuperar contraseña
POST /api/auth/reset-password   # Restablecer contraseña
POST /api/auth/change-password  # Cambiar contraseña
```

### Usuarios

```
GET  /api/users/profile     # Obtener perfil
PUT  /api/users/profile     # Actualizar perfil
POST /api/users/upload-avatar  # Subir avatar
```

### Clientes

```
GET    /api/clients         # Listar clientes
POST   /api/clients         # Crear cliente
GET    /api/clients/:id     # Obtener cliente
PUT    /api/clients/:id     # Actualizar cliente
DELETE /api/clients/:id     # Eliminar cliente
```

### Reservas

```
GET    /api/bookings        # Listar reservas
POST   /api/bookings        # Crear reserva
GET    /api/bookings/:id    # Obtener reserva
PUT    /api/bookings/:id    # Actualizar reserva
DELETE /api/bookings/:id    # Cancelar reserva
```

### Pagos

```
GET  /api/payments          # Listar pagos
POST /api/payments          # Crear pago
GET  /api/payments/:id      # Obtener pago
POST /api/payments/:id/refund  # Reembolsar pago
```

## 🔐 Autenticación

La API utiliza **JWT (JSON Web Tokens)** para la autenticación. Incluye el token en el header:

```
Authorization: Bearer <token>
```

### Refresh Tokens

El sistema implementa refresh tokens para mayor seguridad:

- **Access Token**: Expira en 7 días (configurable)
- **Refresh Token**: Expira en 30 días (configurable)

## 🛡️ Seguridad

- **Helmet.js** para headers de seguridad
- **Rate limiting** en endpoints críticos
- **CORS** configurado para el frontend
- **Validación** de entrada en todos los endpoints
- **Encriptación** de contraseñas con bcrypt
- **Sanitización** de datos de entrada

## 📊 Modelos de Datos

La API incluye 28 modelos principales:

- **User** - Terapeutas y administradores
- **Client** - Clientes del terapeuta
- **Booking** - Reservas y citas
- **Payment** - Gestión de pagos
- **Document** - Documentos y materiales
- **Review** - Reseñas y valoraciones
- **TherapyPlan** - Planes terapéuticos
- Y muchos más...

Ver el archivo `MODELS_RECOMMENDATION.md` en la raíz del proyecto para detalles completos.

## 🔧 Desarrollo

### Estructura de Controladores

```javascript
const { asyncHandler } = require('../middleware/errorHandler');

const getClients = asyncHandler(async (req, res, next) => {
  // Lógica del controlador
  res.status(200).json({
    success: true,
    data: clients
  });
});
```

### Manejo de Errores

```javascript
const { AppError } = require('../middleware/errorHandler');

// Crear error personalizado
throw new AppError('Client not found', 404);
```

### Validación

```javascript
const { body, validationResult } = require('express-validator');

const validateClientCreation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  // ... más validaciones
];
```

## 🧪 Testing

```bash
# Ejecutar tests (cuando estén implementados)
npm test

# Ejecutar tests con coverage
npm run test:coverage
```

## 📦 Deployment

### Variables de Entorno de Producción

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dharaterapeutas
JWT_SECRET=clave_super_secreta_de_produccion
FRONTEND_URL=https://tu-dominio.com
```

### Docker

```dockerfile
# Dockerfile de ejemplo
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Añadir nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia ISC.

## 📞 Soporte

Para soporte técnico o preguntas sobre la API, contacta a:
- Email: info@dharadimensionhumana.es
- Documentación: [API Docs](http://localhost:5000/api-docs) (cuando esté implementada)

---

**Desarrollado con ❤️ para Dharaterapeutas**