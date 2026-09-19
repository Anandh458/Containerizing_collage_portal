require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,

  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "collegeconnect"
  },

  jwtSecret: process.env.JWT_SECRET || "change-this-secret"
};