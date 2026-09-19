const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db");


function authenticateStudent(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication token is required." });
  }

  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.user.role !== "STUDENT") {
      return res.status(403).json({ success: false, message: "Student access required." });
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired authentication token." });
  }
}

async function getStudentId(userId) {
  const [rows] = await pool.execute(
    `SELECT student_id FROM students WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  return rows.length ? rows[0].student_id : null;
}

router.get("/dashboard", authenticateStudent, async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.userId);
    if (!studentId) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const [[profile]] = await pool.execute(
      `SELECT s.student_id, s.register_number, s.year_of_study, s.semester,
              s.phone, s.date_of_birth, s.gender, s.address, s.admission_year,
              u.login_id, u.full_name, u.email,
              d.department_id, d.department_code, d.department_name
       FROM students s
       INNER JOIN users u ON s.user_id = u.user_id
       LEFT JOIN departments d ON s.department_id = d.department_id
       WHERE s.student_id = ? LIMIT 1`,
      [studentId]
    );

    const [courses] = await pool.execute(
      `SELECT sc.student_course_id, c.course_id, c.course_code, c.course_name,
              c.semester, c.credits, sc.academic_year
       FROM student_courses sc
       INNER JOIN courses c ON sc.course_id = c.course_id
       WHERE sc.student_id = ?
       ORDER BY c.semester, c.course_code`,
      [studentId]
    );

    const [attendance] = await pool.execute(
      `SELECT c.course_code, c.course_name,
              COUNT(a.attendance_id) AS total_classes,
              SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_classes,
              SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_classes,
              SUM(CASE WHEN a.status IN ('OD','LEAVE') THEN 1 ELSE 0 END) AS other_classes
       FROM attendance a
       INNER JOIN courses c ON a.course_id = c.course_id
       WHERE a.student_id = ?
       GROUP BY c.course_id, c.course_code, c.course_name
       ORDER BY c.course_code`,
      [studentId]
    );

    const [results] = await pool.execute(
      `SELECT c.course_code, c.course_name, r.semester, r.academic_year,
              r.internal_mark, r.external_mark, r.total_mark, r.grade,
              r.grade_point, r.result_status
       FROM results r
       INNER JOIN courses c ON r.course_id = c.course_id
       WHERE r.student_id = ?
       ORDER BY r.academic_year DESC, r.semester DESC, c.course_code`,
      [studentId]
    );

    res.json({ success: true, profile, courses, attendance, results });
  } catch (error) {
    console.error("Student dashboard error:", error.message);
    res.status(500).json({ success: false, message: "Unable to load student dashboard." });
  }
});

router.get("/profile", authenticateStudent, async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.userId);
    if (!studentId) return res.status(404).json({ success: false, message: "Student profile not found." });

    const [rows] = await pool.execute(
      `SELECT s.student_id, s.register_number, s.year_of_study, s.semester,
              s.phone, s.date_of_birth, s.gender, s.address, s.admission_year,
              u.login_id, u.full_name, u.email,
              d.department_code, d.department_name
       FROM students s
       INNER JOIN users u ON s.user_id = u.user_id
       LEFT JOIN departments d ON s.department_id = d.department_id
       WHERE s.student_id = ? LIMIT 1`,
      [studentId]
    );

    res.json({ success: true, profile: rows[0] || null });
  } catch (error) {
    console.error("Student profile error:", error.message);
    res.status(500).json({ success: false, message: "Unable to load profile." });
  }
});

router.get("/courses", authenticateStudent, async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.userId);
    if (!studentId) return res.status(404).json({ success: false, message: "Student profile not found." });

    const [courses] = await pool.execute(
      `SELECT sc.student_course_id, c.course_id, c.course_code, c.course_name,
              c.semester, c.credits, sc.academic_year
       FROM student_courses sc
       INNER JOIN courses c ON sc.course_id = c.course_id
       WHERE sc.student_id = ?
       ORDER BY c.semester, c.course_code`,
      [studentId]
    );
    res.json({ success: true, courses });
  } catch (error) {
    console.error("Student courses error:", error.message);
    res.status(500).json({ success: false, message: "Unable to load courses." });
  }
});

router.get("/attendance", authenticateStudent, async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.userId);
    if (!studentId) return res.status(404).json({ success: false, message: "Student profile not found." });

    const [attendance] = await pool.execute(
      `SELECT c.course_code, c.course_name, a.attendance_date, a.status, a.remarks
       FROM attendance a
       INNER JOIN courses c ON a.course_id = c.course_id
       WHERE a.student_id = ?
       ORDER BY a.attendance_date DESC, c.course_code`,
      [studentId]
    );
    res.json({ success: true, attendance });
  } catch (error) {
    console.error("Student attendance error:", error.message);
    res.status(500).json({ success: false, message: "Unable to load attendance." });
  }
});

router.get("/results", authenticateStudent, async (req, res) => {
  try {
    const studentId = await getStudentId(req.user.userId);
    if (!studentId) return res.status(404).json({ success: false, message: "Student profile not found." });

    const [results] = await pool.execute(
      `SELECT c.course_code, c.course_name, r.semester, r.academic_year,
              r.internal_mark, r.external_mark, r.total_mark, r.grade,
              r.grade_point, r.result_status
       FROM results r
       INNER JOIN courses c ON r.course_id = c.course_id
       WHERE r.student_id = ?
       ORDER BY r.academic_year DESC, r.semester DESC, c.course_code`,
      [studentId]
    );
    res.json({ success: true, results });
  } catch (error) {
    console.error("Student results error:", error.message);
    res.status(500).json({ success: false, message: "Unable to load results." });
  }
});

module.exports = router;
