require("dotenv").config();

const express = require("express");
const cors = require("cors");

const logger = require("./config/logger");
const sequelize = require("./config/database");

const { optionalAuth } = require("./middleware/auth");

const agentRoutes = require("./routes/agents");
const simulationRoutes = require("./routes/simulation");
const executionRoutes = require("./routes/execution");
const dashboardRoutes = require("./routes/dashboard");
const authRoutes = require("./routes/auth");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// Attach optional auth globally so we can log user activity when token exists
app.use(optionalAuth);

// Request logging with duration tracking
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

app.use("/agents", agentRoutes);
app.use("/simulation", simulationRoutes);
app.use("/execute", executionRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/auth", authRoutes);

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

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ message: "Internal Server Error" });
});

module.exports = app;
