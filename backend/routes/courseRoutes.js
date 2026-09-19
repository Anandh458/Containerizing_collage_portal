const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();
const pool = require("../db");


// ==========================================
// AUTH
// ==========================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token required."
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token."
    });
  }
}

// ==========================================
// ADMIN ONLY
// ==========================================

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Admin access required."
    });
  }

  next();
}

// ==========================================
// GET ALL COURSES
// GET /api/courses
// ==========================================

router.get("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [courses] = await pool.query(`
      SELECT
        c.course_id,
        c.course_code,
        c.course_name,
        c.department_id,
        d.department_code,
        d.department_name,
        c.semester,
        c.credits,
        c.description,
        c.created_at,
        c.updated_at
      FROM courses c
      LEFT JOIN departments d
        ON c.department_id = d.department_id
      ORDER BY c.course_id ASC
    `);

    return res.json({
      success: true,
      count: courses.length,
      courses
    });

  } catch (error) {
    console.error("Get courses error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch courses."
    });
  }
});

// ==========================================
// SEARCH COURSES
// GET /api/courses/search?q=
// ==========================================

router.get(
  "/search",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();

      if (!q) {
        return res.json({
          success: true,
          count: 0,
          courses: []
        });
      }

      const searchTerm = `%${q}%`;

      const [courses] = await pool.query(
        `
        SELECT
          c.course_id,
          c.course_code,
          c.course_name,
          c.department_id,
          d.department_code,
          d.department_name,
          c.semester,
          c.credits,
          c.description,
          c.created_at,
          c.updated_at
        FROM courses c
        LEFT JOIN departments d
          ON c.department_id = d.department_id
        WHERE
          c.course_code LIKE ?
          OR c.course_name LIKE ?
          OR d.department_code LIKE ?
          OR d.department_name LIKE ?
          OR c.description LIKE ?
        ORDER BY c.course_id ASC
        `,
        [
          searchTerm,
          searchTerm,
          searchTerm,
          searchTerm,
          searchTerm
        ]
      );

      return res.json({
        success: true,
        count: courses.length,
        courses
      });

    } catch (error) {
      console.error("Search courses error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to search courses."
      });
    }
  }
);

// ==========================================
// GET SINGLE COURSE
// GET /api/courses/:id
// ==========================================

router.get(
  "/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const courseId = Number(req.params.id);

      if (!Number.isInteger(courseId) || courseId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid course ID."
        });
      }

      const [courses] = await pool.query(
        `
        SELECT
          c.course_id,
          c.course_code,
          c.course_name,
          c.department_id,
          d.department_code,
          d.department_name,
          c.semester,
          c.credits,
          c.description,
          c.created_at,
          c.updated_at
        FROM courses c
        LEFT JOIN departments d
          ON c.department_id = d.department_id
        WHERE c.course_id = ?
        `,
        [courseId]
      );

      if (courses.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Course not found."
        });
      }

      return res.json({
        success: true,
        course: courses[0]
      });

    } catch (error) {
      console.error("Get course error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch course."
      });
    }
  }
);

// ==========================================
// CREATE COURSE
// POST /api/courses
// ==========================================

router.post(
  "/",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const {
        courseCode,
        courseName,
        departmentId,
        semester,
        credits,
        description
      } = req.body;

      if (
        !courseCode ||
        !courseName ||
        !departmentId ||
        !semester ||
        credits === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Course code, course name, department, semester and credits are required."
        });
      }

      const code = String(courseCode).trim().toUpperCase();
      const name = String(courseName).trim();
      const deptId = Number(departmentId);
      const sem = Number(semester);
      const creditValue = Number(credits);
      const desc = description
        ? String(description).trim()
        : null;

      if (!Number.isInteger(deptId) || deptId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid department ID."
        });
      }

      if (!Number.isInteger(sem) || sem < 1 || sem > 8) {
        return res.status(400).json({
          success: false,
          message: "Semester must be between 1 and 8."
        });
      }

      if (!Number.isFinite(creditValue) || creditValue <= 0) {
        return res.status(400).json({
          success: false,
          message: "Credits must be a valid positive number."
        });
      }

      // Check department
      const [department] = await pool.query(
        `
        SELECT department_id
        FROM departments
        WHERE department_id = ?
        LIMIT 1
        `,
        [deptId]
      );

      if (department.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Department not found."
        });
      }

      // Check duplicate course code
      const [existing] = await pool.query(
        `
        SELECT course_id
        FROM courses
        WHERE course_code = ?
        LIMIT 1
        `,
        [code]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Course code already exists."
        });
      }

      const [result] = await pool.query(
        `
        INSERT INTO courses
          (
            course_code,
            course_name,
            department_id,
            semester,
            credits,
            description
          )
        VALUES
          (?, ?, ?, ?, ?, ?)
        `,
        [
          code,
          name,
          deptId,
          sem,
          creditValue,
          desc
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Course created successfully.",
        courseId: result.insertId
      });

    } catch (error) {
      console.error("Create course error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create course."
      });
    }
  }
);

// ==========================================
// UPDATE COURSE
// PUT /api/courses/:id
// ==========================================

router.put(
  "/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const courseId = Number(req.params.id);

      if (!Number.isInteger(courseId) || courseId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid course ID."
        });
      }

      const {
        courseCode,
        courseName,
        departmentId,
        semester,
        credits,
        description
      } = req.body;

      if (
        !courseCode ||
        !courseName ||
        !departmentId ||
        !semester ||
        credits === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Course code, course name, department, semester and credits are required."
        });
      }

      const code = String(courseCode).trim().toUpperCase();
      const name = String(courseName).trim();
      const deptId = Number(departmentId);
      const sem = Number(semester);
      const creditValue = Number(credits);
      const desc = description
        ? String(description).trim()
        : null;

      const [existingCourse] = await pool.query(
        `
        SELECT course_id
        FROM courses
        WHERE course_id = ?
        `,
        [courseId]
      );

      if (existingCourse.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Course not found."
        });
      }

      const [department] = await pool.query(
        `
        SELECT department_id
        FROM departments
        WHERE department_id = ?
        LIMIT 1
        `,
        [deptId]
      );

      if (department.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Department not found."
        });
      }

      const [duplicate] = await pool.query(
        `
        SELECT course_id
        FROM courses
        WHERE course_code = ?
          AND course_id != ?
        LIMIT 1
        `,
        [code, courseId]
      );

      if (duplicate.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Course code already exists."
        });
      }

      await pool.query(
        `
        UPDATE courses
        SET
          course_code = ?,
          course_name = ?,
          department_id = ?,
          semester = ?,
          credits = ?,
          description = ?
        WHERE course_id = ?
        `,
        [
          code,
          name,
          deptId,
          sem,
          creditValue,
          desc,
          courseId
        ]
      );

      return res.json({
        success: true,
        message: "Course updated successfully."
      });

    } catch (error) {
      console.error("Update course error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update course."
      });
    }
  }
);

// ==========================================
// DELETE COURSE
// DELETE /api/courses/:id
// ==========================================

router.delete(
  "/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const courseId = Number(req.params.id);

      if (!Number.isInteger(courseId) || courseId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid course ID."
        });
      }

      // Check faculty assignment
      const [assignments] = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM faculty_courses
        WHERE course_id = ?
        `,
        [courseId]
      );

      if (Number(assignments[0].total) > 0) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot delete this course because faculty are assigned to it. Remove the faculty assignments first."
        });
      }

      const [result] = await pool.query(
        `
        DELETE FROM courses
        WHERE course_id = ?
        `,
        [courseId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Course not found."
        });
      }

      return res.json({
        success: true,
        message: "Course deleted successfully."
      });

    } catch (error) {
      console.error("Delete course error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete course."
      });
    }
  }
);

// ==========================================
// GET FACULTY ASSIGNED TO COURSE
// GET /api/courses/:id/faculty
// ==========================================

router.get(
  "/:id/faculty",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const courseId = Number(req.params.id);

      if (!Number.isInteger(courseId) || courseId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid course ID."
        });
      }

      const [faculty] = await pool.query(
        `
        SELECT
          fc.faculty_course_id,
          fc.faculty_id,
          u.full_name,
          u.email,
          fc.academic_year,
          fc.created_at
        FROM faculty_courses fc
        INNER JOIN faculty f
          ON fc.faculty_id = f.faculty_id
        INNER JOIN users u
          ON f.user_id = u.user_id
        WHERE fc.course_id = ?
        ORDER BY u.full_name ASC
        `,
        [courseId]
      );

      return res.json({
        success: true,
        count: faculty.length,
        faculty
      });

    } catch (error) {
      console.error("Get course faculty error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch assigned faculty."
      });
    }
  }
);

// ==========================================
// ASSIGN FACULTY TO COURSE
// POST /api/courses/:id/faculty
// ==========================================

router.post(
  "/:id/faculty",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const courseId = Number(req.params.id);

      const {
        facultyId,
        academicYear
      } = req.body;

      const facultyIdNumber = Number(facultyId);

      if (
        !Number.isInteger(courseId) ||
        courseId <= 0 ||
        !Number.isInteger(facultyIdNumber) ||
        facultyIdNumber <= 0 ||
        !academicYear
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Course, faculty and academic year are required."
        });
      }

      const year = String(academicYear).trim();

      const [course] = await pool.query(
        `
        SELECT course_id
        FROM courses
        WHERE course_id = ?
        `,
        [courseId]
      );

      if (course.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Course not found."
        });
      }

      const [faculty] = await pool.query(
        `
        SELECT faculty_id
        FROM faculty
        WHERE faculty_id = ?
        `,
        [facultyIdNumber]
      );

      if (faculty.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Faculty not found."
        });
      }

      const [existing] = await pool.query(
        `
        SELECT faculty_course_id
        FROM faculty_courses
        WHERE faculty_id = ?
          AND course_id = ?
          AND academic_year = ?
        LIMIT 1
        `,
        [
          facultyIdNumber,
          courseId,
          year
        ]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            "This faculty is already assigned to this course for this academic year."
        });
      }

      const [result] = await pool.query(
        `
        INSERT INTO faculty_courses
          (
            faculty_id,
            course_id,
            academic_year
          )
        VALUES
          (?, ?, ?)
        `,
        [
          facultyIdNumber,
          courseId,
          year
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Faculty assigned successfully.",
        facultyCourseId: result.insertId
      });

    } catch (error) {
      console.error("Assign faculty error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to assign faculty."
      });
    }
  }
);

// ==========================================
// REMOVE FACULTY FROM COURSE
// DELETE /api/courses/:courseId/faculty/:facultyCourseId
// ==========================================

router.delete(
  "/:courseId/faculty/:facultyCourseId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const courseId = Number(req.params.courseId);
      const facultyCourseId =
        Number(req.params.facultyCourseId);

      if (
        !Number.isInteger(courseId) ||
        courseId <= 0 ||
        !Number.isInteger(facultyCourseId) ||
        facultyCourseId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID."
        });
      }

      const [result] = await pool.query(
        `
        DELETE FROM faculty_courses
        WHERE faculty_course_id = ?
          AND course_id = ?
        `,
        [
          facultyCourseId,
          courseId
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Faculty assignment not found."
        });
      }

      return res.json({
        success: true,
        message: "Faculty assignment removed successfully."
      });

    } catch (error) {
      console.error("Remove faculty assignment error:", error);

      return res.status(500).json({
        success: false,
        message:
          "Failed to remove faculty assignment."
      });
    }
  }
);

module.exports = router;