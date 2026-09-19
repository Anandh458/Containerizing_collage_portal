const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db");



/*
  AUTHENTICATION
*/
function authenticateToken(req, res, next) {

  const authHeader = req.headers.authorization;

  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token required."
    });
  }

  try {

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token."
    });
  }
}


/*
  ADMIN ACCESS ONLY
*/
function requireAdmin(req, res, next) {

  if (!req.user || req.user.role !== "ADMIN") {

    return res.status(403).json({
      success: false,
      message: "Admin access required."
    });
  }

  next();
}


/*
  GET ALL FACULTY
*/
router.get(
  "/",
  authenticateToken,
  requireAdmin,
  async (req, res) => {

    try {

      const [rows] = await pool.query(`
        SELECT
          f.faculty_id,
          f.user_id,
          u.login_id,
          u.full_name,
          u.email,
          u.is_active,
          f.employee_number,
          f.department_id,
          d.department_name,
          f.designation,
          f.qualification,
          f.phone,
          f.joining_date
        FROM faculty f
        INNER JOIN users u
          ON f.user_id = u.user_id
        LEFT JOIN departments d
          ON f.department_id = d.department_id
        ORDER BY f.faculty_id DESC
      `);

      return res.json({
        success: true,
        count: rows.length,
        faculty: rows
      });

    } catch (error) {

      console.error("Get faculty error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch faculty."
      });
    }
  }
);


/*
  SEARCH FACULTY
  Search by Login ID, Name, Employee Number
*/
router.get(
  "/search",
  authenticateToken,
  requireAdmin,
  async (req, res) => {

    try {

      const q =
        (req.query.q || "").trim();

      if (!q) {

        return res.json({
          success: true,
          count: 0,
          faculty: []
        });
      }

      const searchTerm = `%${q}%`;

      const [rows] = await pool.query(
        `
        SELECT
          f.faculty_id,
          f.user_id,
          u.login_id,
          u.full_name,
          u.email,
          u.is_active,
          f.employee_number,
          f.department_id,
          d.department_name,
          f.designation,
          f.qualification,
          f.phone,
          f.joining_date
        FROM faculty f
        INNER JOIN users u
          ON f.user_id = u.user_id
        LEFT JOIN departments d
          ON f.department_id = d.department_id
        WHERE
          u.login_id LIKE ?
          OR u.full_name LIKE ?
          OR f.employee_number LIKE ?
        ORDER BY f.faculty_id DESC
        `,
        [
          searchTerm,
          searchTerm,
          searchTerm
        ]
      );

      return res.json({
        success: true,
        count: rows.length,
        faculty: rows
      });

    } catch (error) {

      console.error("Search faculty error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to search faculty."
      });
    }
  }
);


/*
  GET SINGLE FACULTY
*/
router.get(
  "/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {

    try {

      const facultyId =
        Number(req.params.id);

      if (!Number.isInteger(facultyId)) {

        return res.status(400).json({
          success: false,
          message: "Invalid faculty ID."
        });
      }

      const [rows] = await pool.query(
        `
        SELECT
          f.faculty_id,
          f.user_id,
          u.login_id,
          u.full_name,
          u.email,
          u.is_active,
          f.employee_number,
          f.department_id,
          d.department_name,
          f.designation,
          f.qualification,
          f.phone,
          f.joining_date
        FROM faculty f
        INNER JOIN users u
          ON f.user_id = u.user_id
        LEFT JOIN departments d
          ON f.department_id = d.department_id
        WHERE f.faculty_id = ?
        `,
        [facultyId]
      );

      if (rows.length === 0) {

        return res.status(404).json({
          success: false,
          message: "Faculty not found."
        });
      }

      return res.json({
        success: true,
        faculty: rows[0]
      });

    } catch (error) {

      console.error("Get faculty by ID error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch faculty."
      });
    }
  }
);


/*
  ADD FACULTY
*/
router.post(
  "/",
  authenticateToken,
  requireAdmin,
  async (req, res) => {

    const connection =
      await pool.getConnection();

    try {

      const {
        loginId,
        fullName,
        email,
        password,
        employeeNumber,
        departmentId,
        designation,
        qualification,
        phone,
        joiningDate
      } = req.body;


      /*
        BASIC VALIDATION
      */
      if (
        !loginId ||
        !fullName ||
        !email ||
        !password ||
        !employeeNumber ||
        !departmentId ||
        !designation
      ) {

        return res.status(400).json({
          success: false,
          message: "Please fill all required fields."
        });
      }

      if (password.length < 8) {

        return res.status(400).json({
          success: false,
          message: "Password must contain at least 8 characters."
        });
      }


      /*
        CHECK DUPLICATE LOGIN ID
      */
      const [existingLogin] =
        await connection.query(
          `
          SELECT user_id
          FROM users
          WHERE login_id = ?
          LIMIT 1
          `,
          [loginId.trim()]
        );

      if (existingLogin.length > 0) {

        return res.status(409).json({
          success: false,
          message: "Login ID already exists."
        });
      }


      /*
        CHECK DUPLICATE EMPLOYEE NUMBER
      */
      const [existingEmployee] =
        await connection.query(
          `
          SELECT faculty_id
          FROM faculty
          WHERE employee_number = ?
          LIMIT 1
          `,
          [employeeNumber.trim()]
        );

      if (existingEmployee.length > 0) {

        return res.status(409).json({
          success: false,
          message: "Employee number already exists."
        });
      }


      /*
        CHECK DEPARTMENT
      */
      const [department] =
        await connection.query(
          `
          SELECT department_id
          FROM departments
          WHERE department_id = ?
          LIMIT 1
          `,
          [departmentId]
        );

      if (department.length === 0) {

        return res.status(400).json({
          success: false,
          message: "Selected department does not exist."
        });
      }


      /*
        HASH PASSWORD
      */
      const passwordHash =
        await bcrypt.hash(password, 10);


      await connection.beginTransaction();


      /*
        CREATE USER
      */
      const [userResult] =
        await connection.query(
          `
          INSERT INTO users
          (
            login_id,
            password_hash,
            full_name,
            email,
            role,
            is_active,
            must_change_password
          )
          VALUES (?, ?, ?, ?, 'FACULTY', TRUE, TRUE)
          `,
          [
            loginId.trim(),
            passwordHash,
            fullName.trim(),
            email.trim()
          ]
        );


      const userId =
        userResult.insertId;


      /*
        CREATE FACULTY PROFILE
      */
      const [facultyResult] =
        await connection.query(
          `
          INSERT INTO faculty
          (
            user_id,
            employee_number,
            department_id,
            designation,
            qualification,
            phone,
            joining_date
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            userId,
            employeeNumber.trim(),
            departmentId,
            designation.trim(),
            qualification
              ? qualification.trim()
              : null,
            phone
              ? phone.trim()
              : null,
            joiningDate || null
          ]
        );


      await connection.commit();


      return res.status(201).json({
        success: true,
        message: "Faculty added successfully.",
        facultyId: facultyResult.insertId,
        userId: userId
      });

    } catch (error) {

      await connection.rollback();

      console.error("Add faculty error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to add faculty."
      });

    } finally {

      connection.release();
    }
  }
);


/*
  UPDATE FACULTY
*/
router.put(
  "/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {

    const connection =
      await pool.getConnection();

    try {

      const facultyId =
        Number(req.params.id);

      if (!Number.isInteger(facultyId)) {

        return res.status(400).json({
          success: false,
          message: "Invalid faculty ID."
        });
      }

      const {
        loginId,
        fullName,
        email,
        employeeNumber,
        departmentId,
        designation,
        qualification,
        phone,
        joiningDate
      } = req.body;


      if (
        !loginId ||
        !fullName ||
        !email ||
        !employeeNumber ||
        !departmentId ||
        !designation
      ) {

        return res.status(400).json({
          success: false,
          message: "Please fill all required fields."
        });
      }


      /*
        FIND FACULTY USER
      */
      const [facultyRows] =
        await connection.query(
          `
          SELECT user_id
          FROM faculty
          WHERE faculty_id = ?
          LIMIT 1
          `,
          [facultyId]
        );

      if (facultyRows.length === 0) {

        return res.status(404).json({
          success: false,
          message: "Faculty not found."
        });
      }

      const userId =
        facultyRows[0].user_id;


      /*
        CHECK DUPLICATE LOGIN
      */
      const [duplicateLogin] =
        await connection.query(
          `
          SELECT user_id
          FROM users
          WHERE login_id = ?
            AND user_id <> ?
          LIMIT 1
          `,
          [
            loginId.trim(),
            userId
          ]
        );

      if (duplicateLogin.length > 0) {

        return res.status(409).json({
          success: false,
          message: "Login ID already exists."
        });
      }


      /*
        CHECK DUPLICATE EMPLOYEE NUMBER
      */
      const [duplicateEmployee] =
        await connection.query(
          `
          SELECT faculty_id
          FROM faculty
          WHERE employee_number = ?
            AND faculty_id <> ?
          LIMIT 1
          `,
          [
            employeeNumber.trim(),
            facultyId
          ]
        );

      if (duplicateEmployee.length > 0) {

        return res.status(409).json({
          success: false,
          message: "Employee number already exists."
        });
      }


      /*
        CHECK DEPARTMENT
      */
      const [department] =
        await connection.query(
          `
          SELECT department_id
          FROM departments
          WHERE department_id = ?
          LIMIT 1
          `,
          [departmentId]
        );

      if (department.length === 0) {

        return res.status(400).json({
          success: false,
          message: "Selected department does not exist."
        });
      }


      await connection.beginTransaction();


      /*
        UPDATE USER
      */
      await connection.query(
        `
        UPDATE users
        SET
          login_id = ?,
          full_name = ?,
          email = ?
        WHERE user_id = ?
        `,
        [
          loginId.trim(),
          fullName.trim(),
          email.trim(),
          userId
        ]
      );


      /*
        UPDATE FACULTY PROFILE
      */
      await connection.query(
        `
        UPDATE faculty
        SET
          employee_number = ?,
          department_id = ?,
          designation = ?,
          qualification = ?,
          phone = ?,
          joining_date = ?
        WHERE faculty_id = ?
        `,
        [
          employeeNumber.trim(),
          departmentId,
          designation.trim(),
          qualification
            ? qualification.trim()
            : null,
          phone
            ? phone.trim()
            : null,
          joiningDate || null,
          facultyId
        ]
      );


      await connection.commit();


      return res.json({
        success: true,
        message: "Faculty updated successfully."
      });

    } catch (error) {

      await connection.rollback();

      console.error("Update faculty error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to update faculty."
      });

    } finally {

      connection.release();
    }
  }
);


/*
  ACTIVATE / DEACTIVATE FACULTY
*/
router.patch(
  "/:id/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {

    try {

      const facultyId =
        Number(req.params.id);

      const {
        isActive
      } = req.body;

      if (!Number.isInteger(facultyId)) {

        return res.status(400).json({
          success: false,
          message: "Invalid faculty ID."
        });
      }

      if (typeof isActive !== "boolean") {

        return res.status(400).json({
          success: false,
          message: "isActive must be true or false."
        });
      }


      const [facultyRows] =
        await pool.query(
          `
          SELECT user_id
          FROM faculty
          WHERE faculty_id = ?
          LIMIT 1
          `,
          [facultyId]
        );

      if (facultyRows.length === 0) {

        return res.status(404).json({
          success: false,
          message: "Faculty not found."
        });
      }

      const userId =
        facultyRows[0].user_id;


      await pool.query(
        `
        UPDATE users
        SET is_active = ?
        WHERE user_id = ?
        `,
        [
          isActive,
          userId
        ]
      );


      return res.json({
        success: true,
        message: isActive
          ? "Faculty activated successfully."
          : "Faculty deactivated successfully."
      });

    } catch (error) {

      console.error(
        "Faculty status error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to update faculty status."
      });
    }
  }
);


/*
  RESET FACULTY PASSWORD
*/
router.patch(
  "/:id/reset-password",
  authenticateToken,
  requireAdmin,
  async (req, res) => {

    try {

      const facultyId =
        Number(req.params.id);

      const {
        newPassword
      } = req.body;


      if (!Number.isInteger(facultyId)) {

        return res.status(400).json({
          success: false,
          message: "Invalid faculty ID."
        });
      }

      if (
        !newPassword ||
        newPassword.length < 8
      ) {

        return res.status(400).json({
          success: false,
          message: "Password must contain at least 8 characters."
        });
      }


      const [facultyRows] =
        await pool.query(
          `
          SELECT user_id
          FROM faculty
          WHERE faculty_id = ?
          LIMIT 1
          `,
          [facultyId]
        );

      if (facultyRows.length === 0) {

        return res.status(404).json({
          success: false,
          message: "Faculty not found."
        });
      }

      const userId =
        facultyRows[0].user_id;


      const passwordHash =
        await bcrypt.hash(
          newPassword,
          10
        );


      await pool.query(
        `
        UPDATE users
        SET
          password_hash = ?,
          must_change_password = TRUE
        WHERE user_id = ?
        `,
        [
          passwordHash,
          userId
        ]
      );


      return res.json({
        success: true,
        message: "Faculty password reset successfully."
      });

    } catch (error) {

      console.error(
        "Faculty password reset error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to reset faculty password."
      });
    }
  }
);


/*
  DELETE FACULTY
*/
router.delete(
  "/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {

    const connection =
      await pool.getConnection();

    try {

      const facultyId =
        Number(req.params.id);

      if (!Number.isInteger(facultyId)) {

        return res.status(400).json({
          success: false,
          message: "Invalid faculty ID."
        });
      }


      const [facultyRows] =
        await connection.query(
          `
          SELECT user_id
          FROM faculty
          WHERE faculty_id = ?
          LIMIT 1
          `,
          [facultyId]
        );

      if (facultyRows.length === 0) {

        return res.status(404).json({
          success: false,
          message: "Faculty not found."
        });
      }

      const userId =
        facultyRows[0].user_id;


      await connection.beginTransaction();


      /*
        DELETE FACULTY PROFILE
      */
      await connection.query(
        `
        DELETE FROM faculty
        WHERE faculty_id = ?
        `,
        [facultyId]
      );


      /*
        DELETE USER ACCOUNT
      */
      await connection.query(
        `
        DELETE FROM users
        WHERE user_id = ?
        `,
        [userId]
      );


      await connection.commit();


      return res.json({
        success: true,
        message: "Faculty deleted successfully."
      });

    } catch (error) {

      await connection.rollback();

      console.error(
        "Delete faculty error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to delete faculty."
      });

    } finally {

      connection.release();
    }
  }
);


module.exports = router;