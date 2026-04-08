require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const logger = require("./config/logger");
const sequelize = require("./config/database");

const { optionalAuth } = require("./middleware/auth");

const agentRoutes = require("./routes/agents");
const simulationRoutes = require("./routes/simulation");
const executionRoutes = require("./routes/execution");
const dashboardRoutes = require("./routes/dashboard");
const authRoutes = require("./routes/auth");
const docsRoutes = require("./routes/docs");
const auditsRoutes = require("./routes/audits");
const walletRoutes = require("./routes/wallets");
const taskRoutes = require("./routes/tasks");
const paymentRoutes = require("./routes/payments");
const workflowRoutes = require("./routes/workflow");
const alertRoutes = require("./routes/alerts");
const transactionRoutes = require("./routes/transactions");
const systemRoutes = require("./routes/system");
const settingsRoutes = require("./routes/settings");

const app = express();

/**
 * =============================
 * CORS (cookies require specific origins + credentials)
 * =============================
 */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  // Add your deployed frontend domain(s) here:
];

app.use(
  cors({
    origin: function (origin, cb) {
      // allow curl/postman (no origin)
      if (!origin) return cb(null, true);

      // allow known origins
      if (allowedOrigins.includes(origin)) return cb(null, true);

      // hackathon fallback: allow any origin but still enable cookies
      // NOTE: This "echo origin" behavior is safer than origin:"*"
      return cb(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Body parser
app.use(express.json());

// Cookies
app.use(cookieParser());

app.use(optionalAuth);

app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      userId: req.user?.id || null,
    });
  });

  next();
});

/**
 * =============================
 * Routes
 * =============================
 */
app.use("/auth", authRoutes);
app.use("/agents", agentRoutes);
app.use("/simulation", simulationRoutes);
app.use("/execute", executionRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/docs", docsRoutes);
app.use("/audits", auditsRoutes);
app.use("/wallets", walletRoutes);
app.use("/tasks", taskRoutes);
app.use("/payments", paymentRoutes);
app.use("/workflow", workflowRoutes);
app.use("/alerts", alertRoutes);
app.use("/transactions", transactionRoutes);
app.use("/system", systemRoutes);
app.use("/settings", settingsRoutes);

/**
 * =============================
 * Health Check
 * =============================
 */
app.get("/health", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({
      status: "healthy",
      database: "connected",
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error({
      message: "Database health check failed",
      error: error.message,
    });
    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

/**
 * =============================
 * 404 Handler
 * =============================
 */
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

/**
 * =============================
 * Global Error Handler
 * =============================
 */
app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ message: "Internal Server Error" });
});

module.exports = app;
