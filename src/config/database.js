// src/config/database.js
const { Sequelize } = require("sequelize");
require("dotenv").config();


const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (Supabase Postgres connection string).");
}


module.exports = sequelize;