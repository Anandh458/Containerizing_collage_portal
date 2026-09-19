const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db");

function authenticateToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication token required." });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }
  next();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

// GET /api/departments
router.get("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [departments] = await pool.query(`
      SELECT department_id, department_code, department_name,
             description, is_active, created_at
      FROM departments
      ORDER BY department_name ASC
    `);
    res.json({ success: true, count: departments.length, departments });
  } catch (error) {
    console.error("Get departments error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch departments." });
  }
});

// GET /api/departments/search?q=...
router.get("/search", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const q = cleanText(req.query.q);
    if (!q) return res.json({ success: true, count: 0, departments: [] });
    const term = `%${q}%`;
    const [departments] = await pool.query(`
      SELECT department_id, department_code, department_name,
             description, is_active, created_at
      FROM departments
      WHERE department_code LIKE ?
         OR department_name LIKE ?
         OR COALESCE(description, '') LIKE ?
      ORDER BY department_name ASC
    `, [term, term, term]);
    res.json({ success: true, count: departments.length, departments });
  } catch (error) {
    console.error("Search departments error:", error);
    res.status(500).json({ success: false, message: "Unable to search departments." });
  }
});


// GET /api/departments/:id
router.get("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid department ID." });
    }
    const [rows] = await pool.query(`
      SELECT department_id, department_code, department_name,
             description, is_active, created_at
      FROM departments WHERE department_id = ? LIMIT 1
    `, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Department not found." });
    res.json({ success: true, department: rows[0] });
  } catch (error) {
    console.error("Get department error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch department." });
  }
});

// POST /api/departments
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const departmentCode = cleanText(req.body.departmentCode).toUpperCase();
    const departmentName = cleanText(req.body.departmentName);
    const description = cleanText(req.body.description) || null;

    if (!departmentCode || !departmentName) {
      return res.status(400).json({ success: false, message: "Department code and name are required." });
    }
    if (departmentCode.length > 20) return res.status(400).json({ success: false, message: "Department code must be 20 characters or less." });
    if (departmentName.length > 150) return res.status(400).json({ success: false, message: "Department name must be 150 characters or less." });

    const [existing] = await pool.query(
      "SELECT department_id FROM departments WHERE department_code = ? OR department_name = ? LIMIT 1",
      [departmentCode, departmentName]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: "Department code or name already exists." });
    }

    const [result] = await pool.query(
      `INSERT INTO departments (department_code, department_name, description, is_active)
       VALUES (?, ?, ?, 1)`,
      [departmentCode, departmentName, description]
    );

    const [rows] = await pool.query(
      `SELECT department_id, department_code, department_name, description, is_active, created_at
       FROM departments WHERE department_id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, message: "Department created successfully.", department: rows[0] });
  } catch (error) {
    console.error("Create department error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Department code or name already exists." });
    }
    res.status(500).json({ success: false, message: "Unable to create department." });
  }
});

// PUT /api/departments/:id
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const departmentName = cleanText(req.body.departmentName);
    const description = cleanText(req.body.description) || null;

    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Invalid department ID." });
    if (!departmentName) return res.status(400).json({ success: false, message: "Department name is required." });

    const [existing] = await pool.query("SELECT department_id FROM departments WHERE department_id = ?", [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: "Department not found." });

    const [duplicate] = await pool.query(
      "SELECT department_id FROM departments WHERE department_name = ? AND department_id <> ? LIMIT 1",
      [departmentName, id]
    );
    if (duplicate.length) return res.status(409).json({ success: false, message: "Department name already exists." });

    await pool.query(
      "UPDATE departments SET department_name = ?, description = ? WHERE department_id = ?",
      [departmentName, description, id]
    );

    const [rows] = await pool.query(
      `SELECT department_id, department_code, department_name, description, is_active, created_at
       FROM departments WHERE department_id = ?`,
      [id]
    );
    res.json({ success: true, message: "Department updated successfully.", department: rows[0] });
  } catch (error) {
    console.error("Update department error:", error);
    res.status(500).json({ success: false, message: "Unable to update department." });
  }
});

// PATCH /api/departments/:id/status
router.patch("/:id/status", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const isActive = req.body.isActive === true || req.body.isActive === 1 || req.body.isActive === "1";
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Invalid department ID." });

    const [result] = await pool.query("UPDATE departments SET is_active = ? WHERE department_id = ?", [isActive ? 1 : 0, id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Department not found." });
    res.json({ success: true, message: `Department ${isActive ? "activated" : "deactivated"} successfully.` });
  } catch (error) {
    console.error("Department status error:", error);
    res.status(500).json({ success: false, message: "Unable to update department status." });
  }
});

// DELETE /api/departments/:id
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Invalid department ID." });

    const [usageRows] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM students WHERE department_id = ?) AS students,
        (SELECT COUNT(*) FROM faculty WHERE department_id = ?) AS faculty,
        (SELECT COUNT(*) FROM courses WHERE department_id = ?) AS courses
    `, [id, id, id]);
    const usage = usageRows[0] || { students: 0, faculty: 0, courses: 0 };

    if (Number(usage.students) > 0 || Number(usage.faculty) > 0 || Number(usage.courses) > 0) {
      return res.status(409).json({
        success: false,
        message: "This department is in use. Deactivate it instead of deleting it."
      });
    }

    const [result] = await pool.query("DELETE FROM departments WHERE department_id = ?", [id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Department not found." });
    res.json({ success: true, message: "Department deleted successfully." });
  } catch (error) {
    console.error("Delete department error:", error);
    res.status(500).json({ success: false, message: "Unable to delete department." });
  }
});

module.exports = router;
