const config = require("./config");
process.env.JWT_SECRET = config.jwtSecret;
const express = require("express");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const studentRoutes = require("./routes/studentRoutes");
const facultyRoutes = require("./routes/facultyRoutes");
const facultyPortalRoutes = require("./routes/facultyPortalRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const courseRoutes = require("./routes/courseRoutes");
const studentPortalRoutes = require("./routes/studentPortalRoutes");
const adminAcademicRoutes = require("./routes/adminAcademicRoutes");
const studentAssignmentRoutes = require("./routes/studentAssignmentRoutes");
require("dotenv").config();

const app = express();
const PORT = config.port;

// Middleware
app.use(cors());
app.use(express.json({
  limit: "1mb",
  strict: true
}));
app.use("/api/students", studentRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/faculty-portal", facultyPortalRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/student-portal", studentPortalRoutes);
app.use("/api/academic", adminAcademicRoutes);
app.use("/api/student-assignments", studentAssignmentRoutes);

// ==========================================
// HOME / HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "AJV College Management Backend is running!",
  });
});

function authenticateAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication token required." });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
}

app.get("/api/dashboard/summary", authenticateAdmin, async (req, res) => {
  try {
    const [countRows] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM students) AS students,
        (SELECT COUNT(*) FROM faculty) AS faculty,
        (SELECT COUNT(*) FROM departments) AS departments,
        (SELECT COUNT(*) FROM courses) AS courses,
        (SELECT COUNT(*) FROM results) AS academic_records
    `);
    const counts = countRows[0] || {};
    const [departmentOverview] = await db.query(`
      SELECT d.department_id, d.department_code, d.department_name,
             COUNT(DISTINCT s.student_id) AS student_count,
             COUNT(DISTINCT f.faculty_id) AS faculty_count
      FROM departments d
      LEFT JOIN students s ON s.department_id = d.department_id
      LEFT JOIN faculty f ON f.department_id = d.department_id
      GROUP BY d.department_id, d.department_code, d.department_name
      ORDER BY student_count DESC, d.department_name ASC
      LIMIT 6
    `);
    const [recentStudents] = await db.query(`
      SELECT s.student_id, s.register_number, u.full_name,
             d.department_code, s.year_of_study, s.semester, s.created_at
      FROM students s
      INNER JOIN users u ON u.user_id = s.user_id
      LEFT JOIN departments d ON d.department_id = s.department_id
      ORDER BY s.created_at DESC, s.student_id DESC
      LIMIT 5
    `);
    const [recentActivity] = await db.query(`
      SELECT r.result_id, r.updated_at, r.result_status,
             u.full_name AS student_name, c.course_code
      FROM results r
      INNER JOIN students s ON s.student_id = r.student_id
      INNER JOIN users u ON u.user_id = s.user_id
      INNER JOIN courses c ON c.course_id = r.course_id
      ORDER BY r.updated_at DESC, r.result_id DESC
      LIMIT 5
    `);
    res.json({
      success: true,
      counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])),
      departmentOverview,
      recentStudents,
      recentActivity
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    res.status(500).json({ success: false, message: "Unable to load dashboard summary." });
  }
});

// ==========================================
// DATABASE TEST
// ==========================================

app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 AS connected");

    res.json({
      success: true,
      message: "MySQL database connected successfully!",
      result: rows,
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      success: false,
      message: "Database connection failed.",
    });
  }
});

// ==========================================
// LOGIN
// ==========================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const loginId = typeof req.body?.loginId === "string" ? req.body.loginId.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    // Validate input
    if (!loginId || !password) {
      return res.status(400).json({
        success: false,
        message: "Login ID and password are required.",
      });
    }

    // Find user
    const [users] = await db.execute(
      `
      SELECT
        user_id,
        login_id,
        password_hash,
        full_name,
        email,
        role,
        is_active,
        must_change_password
      FROM users
      WHERE login_id = ?
      LIMIT 1
      `,
      [loginId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid login ID or password.",
      });
    }

    const user = users[0];

    // Check active status
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact the administrator.",
      });
    }

    // Verify password
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid login ID or password.",
      });
    }

    // Create JWT token
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");
      return res.status(500).json({
        success: false,
        message: "Authentication is not configured on the server.",
      });
    }

    const token = jwt.sign(
      {
        userId: user.user_id,
        loginId: user.login_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    // Send successful response
    res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.user_id,
        loginId: user.login_id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        mustChangePassword: Boolean(user.must_change_password),
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error during login.",
    });
  }
});

// Convert malformed JSON request bodies into a predictable JSON API error.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ success: false, message: "Invalid JSON request body." });
  }
  next(err);
});

// Central JSON error handler for API failures.
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith("/api/")) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.expose ? err.message : "Internal server error."
    });
  }
  next(err);
});

// JSON 404 for unknown API endpoints so frontend never receives an HTML error page.
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Serve the complete frontend from the same Express server.
// This also allows opening http://localhost:5000/ without Live Server.
app.use(express.static(path.join(__dirname, "../frontend")));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(
    `AJV College Management server running on http://localhost:${PORT}`
  );
});