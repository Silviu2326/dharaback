const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

// Import routes
const authRoutes = require("./routes/authRoutes");
const supabaseAuthRoutes = require("./routes/supabaseAuthRoutes");
const stripeRoutes = require("./routes/stripeRoutes");
const smsRoutes = require("./routes/smsRoutes");
const userRoutes = require("./routes/userRoutes");
const professionalProfileRoutes = require("./routes/professionalProfileRoutes");
const clientRoutes = require("./routes/clientRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const bookingPaymentRoutes = require("./routes/bookingPaymentRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const documentRoutes = require("./routes/documentRoutes");
const clientDocumentRoutes = require("./routes/clientDocumentRoutes");
const clientReviewRoutes = require("./routes/clientReviewRoutes");
const clientPaymentRoutes = require("./routes/clientPaymentRoutes");
const clientPaymentSettingsRoutes = require("./routes/clientPaymentSettingsRoutes");
const clientTherapistRoutes = require("./routes/clientTherapistRoutes");
const clientNotificationRoutes = require("./routes/clientNotificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const availabilityRoutes = require("./routes/availabilityRoutes");
const planRoutes = require("./routes/planRoutes");
const integrationRoutes = require("./routes/integrationRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const therapyPlanRoutes = require("./routes/therapyPlanRoutes");
const planAssignmentRoutes = require("./routes/planAssignmentRoutes");
const workLocationRoutes = require("./routes/workLocationRoutes");
const credentialsRoutes = require("./routes/credentialsRoutes");
const ratesRoutes = require("./routes/ratesRoutes");
const pricingPackageRoutes = require("./routes/pricingPackageRoutes");
const couponRoutes = require("./routes/couponRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const therapistRegistrationRoutes = require("./routes/therapistRegistrationRoutes");
const clientPlanProgressRoutes = require("./routes/clientPlanProgressRoutes");
const sessionNoteRoutes = require("./routes/sessionNoteRoutes");
const noteRoutes = require("./routes/noteRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const terapiasRoutes = require("./routes/terapiasRoutes");
const autoResponseRoutes = require("./routes/autoResponseRoutes");
const healthRoutes = require("./routes/health");
const storageRoutes = require("./routes/storageRoutes");

// Import middleware
const { errorHandler } = require("./middleware/errorHandler");
const { notFound } = require("./middleware/notFound");

const app = express();

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:8081", // React Native Web Metro dev server
  "http://localhost:3000",
  "http://127.0.0.1:8081",
  "https://dhara-peach.vercel.app", // Frontend en Vercel
  "https://dharaterapeutas.com", // Dominio personalizado si existe
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.log(`❌ CORS blocked origin: ${origin}`);
        console.log(`✅ Allowed origins: ${allowedOrigins.join(", ")}`);
        return callback(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    allowedHeaders: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

// Rate limiting - Disabled for development
if (process.env.NODE_ENV === "production") {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX || 100,
    message: {
      error: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);
} else {
  // In development, allow unlimited requests
  console.log("⚠️  Rate limiting disabled for development environment");
}

// Body parsing middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Global request logger middleware (for debugging)
app.use((req, res, next) => {
  console.log("\n🔍 ===== INCOMING REQUEST =====");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", {
    "content-type": req.headers["content-type"],
    authorization: req.headers.authorization ? "Bearer ***" : "none",
    origin: req.headers.origin,
    "user-agent": req.headers["user-agent"]?.substring(0, 50) + "...",
  });
  console.log("Query:", req.query);
  console.log("================================\n");
  next();
});

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/supabase", supabaseAuthRoutes);
app.use("/api/payments/stripe", stripeRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile", professionalProfileRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/booking-payments", bookingPaymentRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/client/documents", clientDocumentRoutes);
app.use("/api/client/reviews", clientReviewRoutes);
app.use("/api/client/payments", clientPaymentRoutes);
app.use("/api/client-payment-settings", clientPaymentSettingsRoutes);
app.use("/api/client-therapists", clientTherapistRoutes);
app.use("/api/client/notifications", clientNotificationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/therapy-plans", therapyPlanRoutes);
app.use("/api/plan-assignments", planAssignmentRoutes);
app.use("/api/work-locations", workLocationRoutes);
app.use("/api/credentials", credentialsRoutes);
app.use("/api/rates", ratesRoutes);
app.use("/api/pricing-packages", pricingPackageRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/terapeutas", therapistRegistrationRoutes);
app.use("/api/client-plan-progress", clientPlanProgressRoutes);
app.use("/api/session-notes", sessionNoteRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/terapias", terapiasRoutes);
app.use("/api/auto-responses", autoResponseRoutes);
app.use("/api/storage", storageRoutes);

// Test endpoints for debugging (BEFORE 404 handler)
app.get("/test", (req, res) => {
  console.log("✅ GET /test called");
  res.status(200).json({
    success: true,
    message: "GET test endpoint working!",
    timestamp: new Date().toISOString(),
    headers: req.headers,
    query: req.query,
  });
});

app.post("/test", (req, res) => {
  console.log("✅ POST /test called");
  console.log("Body received:", req.body);
  res.status(200).json({
    success: true,
    message: "POST test endpoint working!",
    timestamp: new Date().toISOString(),
    receivedData: req.body,
    headers: req.headers,
  });
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;
