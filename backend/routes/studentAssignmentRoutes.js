/*
 * Admin → Assign Student to Faculty
 * ---------------------------------
 * Manages direct student ↔ faculty ↔ course assignments stored in the
 * `student_faculty_assignments` table. This is separate from the existing
 * `faculty_courses` / `student_courses` tables so nothing existing changes.
 *
 * Mounted at: /api/student-assignments   (ADMIN only)
 *
 *   GET    /options      → students, faculty, courses for the dropdowns
 *   GET    /             → list all assignments
 *   POST   /             → create assignment { studentId, facultyId, courseId }
 *   DELETE /:id          → remove only the assignment row
 */
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db");

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication token required." });
  }
  try {
    req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
}

function positiveInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* Creates the assignment table on first start if it does not exist yet.
   Uses the same MySQL pool/connection as the rest of the application. */
async function ensureAssignmentTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_faculty_assignments (
      assignment_id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      faculty_id INT NOT NULL,
      course_id INT NOT NULL,
      assigned_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_student_faculty_course (student_id, faculty_id, course_id),
      CONSTRAINT fk_sfa_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
      CONSTRAINT fk_sfa_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON DELETE CASCADE,
      CONSTRAINT fk_sfa_course  FOREIGN KEY (course_id)  REFERENCES courses(course_id)  ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
const tableReady = ensureAssignmentTable().catch((e) => {
  console.error("Could not ensure student_faculty_assignments table:", e.message);
});

router.get("/options", auth, async (req, res) => {
  try {
    const [students] = await pool.query(`
      SELECT s.student_id, s.register_number, u.full_name,
             d.department_code, d.department_name, s.year_of_study, s.semester
      FROM students s
      INNER JOIN users u ON u.user_id = s.user_id
      LEFT JOIN departments d ON d.department_id = s.department_id
      WHERE u.is_active = 1
      ORDER BY s.register_number
    `);
    const [faculty] = await pool.query(`
      SELECT f.faculty_id, u.full_name, f.employee_number, f.designation,
             d.department_code, d.department_name
      FROM faculty f
      INNER JOIN users u ON u.user_id = f.user_id
      LEFT JOIN departments d ON d.department_id = f.department_id
      WHERE u.is_active = 1
      ORDER BY u.full_name
    `);
    const [courses] = await pool.query(`
      SELECT c.course_id, c.course_code, c.course_name, c.semester,
             d.department_code, d.department_name
      FROM courses c
      LEFT JOIN departments d ON d.department_id = c.department_id
      ORDER BY c.course_code
    `);
    res.json({ success: true, students, faculty, courses });
  } catch (e) {
    console.error("Student assignment options:", e);
    res.status(500).json({ success: false, message: "Unable to load students, faculty and courses." });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    await tableReady;
    const [rows] = await pool.query(`
      SELECT a.assignment_id, a.student_id, a.faculty_id, a.course_id, a.created_at,
             s.register_number, su.full_name AS student_name,
             fu.full_name AS faculty_name, f.employee_number,
             c.course_code, c.course_name,
             d.department_code, d.department_name
      FROM student_faculty_assignments a
      INNER JOIN students s ON s.student_id = a.student_id
      INNER JOIN users su ON su.user_id = s.user_id
      INNER JOIN faculty f ON f.faculty_id = a.faculty_id
      INNER JOIN users fu ON fu.user_id = f.user_id
      INNER JOIN courses c ON c.course_id = a.course_id
      LEFT JOIN departments d ON d.department_id = s.department_id
      ORDER BY a.created_at DESC, a.assignment_id DESC
    `);
    res.json({ success: true, assignments: rows });
  } catch (e) {
    console.error("List student assignments:", e);
    res.status(500).json({ success: false, message: "Unable to load student assignments." });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    await tableReady;
    const studentId = positiveInt(req.body?.studentId);
    const facultyId = positiveInt(req.body?.facultyId);
    const courseId = positiveInt(req.body?.courseId);
    if (!studentId || !facultyId || !courseId) {
      return res.status(400).json({ success: false, message: "Please select a student, a faculty member and a course." });
    }

    const [[s], [f], [c]] = await Promise.all([
      pool.query("SELECT student_id FROM students WHERE student_id = ?", [studentId]),
      pool.query("SELECT faculty_id FROM faculty WHERE faculty_id = ?", [facultyId]),
      pool.query("SELECT course_id FROM courses WHERE course_id = ?", [courseId])
    ]);
    if (!s.length) return res.status(400).json({ success: false, message: "Selected student was not found." });
    if (!f.length) return res.status(400).json({ success: false, message: "Selected faculty was not found." });
    if (!c.length) return res.status(400).json({ success: false, message: "Selected course was not found." });

    const [dup] = await pool.query(
      `SELECT assignment_id FROM student_faculty_assignments
       WHERE student_id = ? AND faculty_id = ? AND course_id = ? LIMIT 1`,
      [studentId, facultyId, courseId]
    );
    if (dup.length) {
      return res.status(409).json({ success: false, message: "This student is already assigned to this faculty for the selected course." });
    }

    const [r] = await pool.query(
      `INSERT INTO student_faculty_assignments (student_id, faculty_id, course_id, assigned_by)
       VALUES (?, ?, ?, ?)`,
      [studentId, facultyId, courseId, req.user.userId || null]
    );
    res.status(201).json({ success: true, message: "Student assigned successfully.", assignmentId: r.insertId });
  } catch (e) {
    console.error("Assign student:", e);
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "This student is already assigned to this faculty for the selected course." });
    }
    res.status(500).json({ success: false, message: "Unable to assign student." });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const id = positiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid assignment ID." });
    // Deletes ONLY the assignment row. Students, faculty and courses are untouched.
    const [r] = await pool.query("DELETE FROM student_faculty_assignments WHERE assignment_id = ?", [id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Assignment not found." });
    res.json({ success: true, message: "Assignment removed successfully." });
  } catch (e) {
    console.error("Remove student assignment:", e);
    res.status(500).json({ success: false, message: "Unable to remove assignment." });
  }
});

module.exports = router;
