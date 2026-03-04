const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Agentity API",
      version: "1.0.0",
      description:
        "Agentity backend APIs (Auth, Agents, Simulation, Execution, Dashboard).",
    },
    servers: [
      { url: "http://localhost:5000", description: "Local" },
      { url: "https://agentity-backend.onrender.com", description: "Render" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        cookieAuth: { type: "apiKey", in: "cookie", name: "agentity_jwt" },
      },
    },
  },
  apis: ["./src/routes/*.js"], // reads JSDoc OpenAPI blocks from your route files
};

module.exports = swaggerJSDoc(options);