const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db");

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success:false, message:"Authentication token is required." });
  }
  try {
    req.user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success:false, message:"Invalid or expired authentication token." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ success:false, message:"Admin access required." });
  }
  next();
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET ALL
router.get("/", authenticateToken, requireAdmin, async (req,res) => {
  try {
    const [students] = await pool.execute(`
      SELECT s.student_id,u.login_id,u.full_name,u.email,u.is_active,
             d.department_id,d.department_code,d.department_name,
             s.year_of_study,s.semester,s.admission_year,s.register_number,
             s.phone,s.date_of_birth,s.gender,s.address
      FROM students s
      INNER JOIN users u ON s.user_id=u.user_id
      LEFT JOIN departments d ON s.department_id=d.department_id
      ORDER BY s.student_id
    `);
    res.json({success:true,count:students.length,students});
  } catch (error) {
    console.error("Get students error:",error);
    res.status(500).json({success:false,message:"Unable to fetch students."});
  }
});

// SEARCH
router.get("/search", authenticateToken, requireAdmin, async (req,res) => {
  try {
    const search=clean(req.query.q);
    if(!search) return res.json({success:true,count:0,students:[]});
    const v=`%${search}%`;
    const [students]=await pool.execute(`
      SELECT s.student_id,u.login_id,u.full_name,u.email,u.is_active,
             d.department_id,d.department_code,d.department_name,
             s.year_of_study,s.semester,s.admission_year,s.register_number,
             s.phone,s.date_of_birth,s.gender,s.address
      FROM students s
      INNER JOIN users u ON s.user_id=u.user_id
      LEFT JOIN departments d ON s.department_id=d.department_id
      WHERE u.login_id LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?
            OR s.register_number LIKE ? OR d.department_code LIKE ?
            OR d.department_name LIKE ?
      ORDER BY s.student_id
    `,[v,v,v,v,v,v]);
    res.json({success:true,count:students.length,students});
  } catch(error) {
    console.error("Search students error:",error);
    res.status(500).json({success:false,message:"Unable to search students."});
  }
});

// ADD STUDENT
router.post("/", authenticateToken, requireAdmin, async (req,res) => {
  let connection;
  try {
    const loginId=clean(req.body.loginId);
    const fullName=clean(req.body.fullName);
    const email=clean(req.body.email).toLowerCase();
    const password=typeof req.body.password==="string" ? req.body.password : "";
    const departmentId=positiveInt(req.body.departmentId);
    const yearOfStudy=positiveInt(req.body.yearOfStudy);
    const semester=positiveInt(req.body.semester);
    const admissionYear=positiveInt(req.body.admissionYear);
    const registerNumber=clean(req.body.registerNumber).toUpperCase();
    const phone=clean(req.body.phone);
    const dateOfBirth=req.body.dateOfBirth || null;
    const gender=clean(req.body.gender) || null;
    const address=clean(req.body.address) || null;

    if(!loginId || !fullName || !email || !password || !departmentId ||
       !yearOfStudy || !semester || !admissionYear || !registerNumber) {
      return res.status(400).json({success:false,message:"Please fill all required student fields."});
    }

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({success:false,message:"Please enter a valid email address."});
    }
    if(password.length < 8) {
      return res.status(400).json({success:false,message:"Password must contain at least 8 characters."});
    }
    if(yearOfStudy < 1 || yearOfStudy > 6) {
      return res.status(400).json({success:false,message:"Year of study must be between 1 and 6."});
    }
    if(semester < 1 || semester > 12) {
      return res.status(400).json({success:false,message:"Semester must be between 1 and 12."});
    }
    if(admissionYear < 2000 || admissionYear > 2100) {
      return res.status(400).json({success:false,message:"Please enter a valid admission year."});
    }
    if(!/^[A-Z0-9._-]{2,50}$/i.test(loginId)) {
      return res.status(400).json({success:false,message:"Login ID can contain letters, numbers, dot, underscore and hyphen."});
    }

    // Validate the selected department before opening the transaction.
    const [departments]=await pool.execute(
      `SELECT department_id FROM departments WHERE department_id=? AND is_active=1 LIMIT 1`,
      [departmentId]
    );
    if(!departments.length) {
      return res.status(400).json({success:false,message:"Selected department is not available. Please choose an active department."});
    }

    const [duplicateLogin]=await pool.execute(
      `SELECT user_id FROM users WHERE login_id=? LIMIT 1`,[loginId]
    );
    if(duplicateLogin.length) {
      return res.status(409).json({success:false,message:"Login ID already exists. Please choose another."});
    }

    const [duplicateEmail]=await pool.execute(
      `SELECT user_id FROM users WHERE email=? LIMIT 1`,[email]
    );
    if(duplicateEmail.length) {
      return res.status(409).json({success:false,message:"Email already exists. Please use another email."});
    }

    const [duplicateRegister]=await pool.execute(
      `SELECT student_id FROM students WHERE register_number=? LIMIT 1`,[registerNumber]
    );
    if(duplicateRegister.length) {
      return res.status(409).json({success:false,message:"Register number already exists. Please use another."});
    }

    const passwordHash=await bcrypt.hash(password,12);
    connection=await pool.getConnection();
    await connection.beginTransaction();

    const [userResult]=await connection.execute(`
      INSERT INTO users
      (login_id,password_hash,full_name,email,role,is_active,must_change_password)
      VALUES (?,?,?,?, 'STUDENT', TRUE, TRUE)
    `,[loginId,passwordHash,fullName,email]);

    const [studentResult]=await connection.execute(`
      INSERT INTO students
      (user_id,register_number,department_id,year_of_study,semester,
       phone,date_of_birth,gender,address,admission_year)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `,[userResult.insertId,registerNumber,departmentId,yearOfStudy,semester,
       phone||null,dateOfBirth,gender,address,admissionYear]);

    await connection.commit();

    res.status(201).json({
      success:true,
      message:"Student created successfully.",
      studentId:studentResult.insertId
    });
  } catch(error) {
    if(connection) await connection.rollback();
    console.error("Create student error:",error);

    if(error.code==="ER_DUP_ENTRY") {
      const msg=String(error.sqlMessage||"").toLowerCase();
      if(msg.includes("email")) return res.status(409).json({success:false,message:"Email already exists."});
      if(msg.includes("login_id")) return res.status(409).json({success:false,message:"Login ID already exists."});
      if(msg.includes("register_number")) return res.status(409).json({success:false,message:"Register number already exists."});
    }
    if(error.code==="ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({success:false,message:"Selected department does not exist."});
    }
    res.status(500).json({success:false,message:"Unable to create student. Check the server terminal for details."});
  } finally {
    if(connection) connection.release();
  }
});

// GET ONE
router.get("/:id", authenticateToken, requireAdmin, async (req,res) => {
  try {
    const id=positiveInt(req.params.id);
    if(!id) return res.status(400).json({success:false,message:"Invalid student ID."});
    const [students]=await pool.execute(`
      SELECT s.student_id,s.user_id,u.login_id,u.full_name,u.email,u.is_active,
             d.department_id,d.department_code,d.department_name,
             s.year_of_study,s.semester,s.admission_year,s.register_number,
             s.phone,s.date_of_birth,s.gender,s.address
      FROM students s
      INNER JOIN users u ON s.user_id=u.user_id
      LEFT JOIN departments d ON s.department_id=d.department_id
      WHERE s.student_id=? LIMIT 1
    `,[id]);
    if(!students.length) return res.status(404).json({success:false,message:"Student not found."});
    res.json({success:true,student:students[0]});
  } catch(error) {
    console.error("Get student error:",error);
    res.status(500).json({success:false,message:"Unable to fetch student."});
  }
});

// UPDATE
router.put("/:id", authenticateToken, requireAdmin, async (req,res) => {
  let connection;
  try {
    const id=positiveInt(req.params.id);
    if(!id) return res.status(400).json({success:false,message:"Invalid student ID."});

    const fullName=clean(req.body.fullName);
    const email=clean(req.body.email).toLowerCase();
    const departmentId=positiveInt(req.body.departmentId);
    const yearOfStudy=positiveInt(req.body.yearOfStudy);
    const semester=positiveInt(req.body.semester);
    const admissionYear=positiveInt(req.body.admissionYear);
    const registerNumber=clean(req.body.registerNumber).toUpperCase();
    const phone=clean(req.body.phone);
    const dateOfBirth=req.body.dateOfBirth||null;
    const gender=clean(req.body.gender)||null;
    const address=clean(req.body.address)||null;

    if(!fullName||!email||!departmentId||!yearOfStudy||!semester||!admissionYear||!registerNumber)
      return res.status(400).json({success:false,message:"Please fill all required student fields."});

    const [studentRows]=await pool.execute(
      `SELECT user_id FROM students WHERE student_id=? LIMIT 1`,[id]
    );
    if(!studentRows.length) return res.status(404).json({success:false,message:"Student not found."});
    const userId=studentRows[0].user_id;

    const [dept]=await pool.execute(
      `SELECT department_id FROM departments WHERE department_id=? AND is_active=1 LIMIT 1`,[departmentId]
    );
    if(!dept.length) return res.status(400).json({success:false,message:"Selected department is not active."});

    const [emailRows]=await pool.execute(
      `SELECT user_id FROM users WHERE email=? AND user_id<>? LIMIT 1`,[email,userId]
    );
    if(emailRows.length) return res.status(409).json({success:false,message:"Email already exists."});

    const [regRows]=await pool.execute(
      `SELECT student_id FROM students WHERE register_number=? AND student_id<>? LIMIT 1`,[registerNumber,id]
    );
    if(regRows.length) return res.status(409).json({success:false,message:"Register number already exists."});

    connection=await pool.getConnection();
    await connection.beginTransaction();

    await connection.execute(`UPDATE users SET full_name=?,email=? WHERE user_id=?`,
      [fullName,email,userId]);
    await connection.execute(`
      UPDATE students SET department_id=?,year_of_study=?,semester=?,admission_year=?,
      register_number=?,phone=?,date_of_birth=?,gender=?,address=? WHERE student_id=?
    `,[departmentId,yearOfStudy,semester,admissionYear,registerNumber,phone||null,
       dateOfBirth,gender,address,id]);

    await connection.commit();
    res.json({success:true,message:"Student updated successfully."});
  } catch(error) {
    if(connection) await connection.rollback();
    console.error("Update student error:",error);
    if(error.code==="ER_DUP_ENTRY") return res.status(409).json({success:false,message:"A student with the same email or register number already exists."});
    res.status(500).json({success:false,message:"Unable to update student."});
  } finally {
    if(connection) connection.release();
  }
});

// STATUS
router.patch("/:id/status", authenticateToken, requireAdmin, async (req,res) => {
  try {
    const id=positiveInt(req.params.id);
    if(!id) return res.status(400).json({success:false,message:"Invalid student ID."});
    if(typeof req.body.isActive!=="boolean") return res.status(400).json({success:false,message:"isActive must be true or false."});
    const [rows]=await pool.execute(`SELECT user_id FROM students WHERE student_id=? LIMIT 1`,[id]);
    if(!rows.length) return res.status(404).json({success:false,message:"Student not found."});
    await pool.execute(`UPDATE users SET is_active=? WHERE user_id=?`,[req.body.isActive,rows[0].user_id]);
    res.json({success:true,message:req.body.isActive?"Student account activated.":"Student account deactivated."});
  } catch(error) {
    console.error("Student status error:",error);
    res.status(500).json({success:false,message:"Unable to update student account status."});
  }
});

// RESET PASSWORD
router.patch("/:id/reset-password", authenticateToken, requireAdmin, async (req,res) => {
  try {
    const id=positiveInt(req.params.id);
    const newPassword=typeof req.body.newPassword==="string"?req.body.newPassword:"";
    if(!id) return res.status(400).json({success:false,message:"Invalid student ID."});
    if(newPassword.length<8) return res.status(400).json({success:false,message:"New password must contain at least 8 characters."});
    const [rows]=await pool.execute(`SELECT user_id FROM students WHERE student_id=? LIMIT 1`,[id]);
    if(!rows.length) return res.status(404).json({success:false,message:"Student not found."});
    const hash=await bcrypt.hash(newPassword,12);
    await pool.execute(`UPDATE users SET password_hash=?,must_change_password=TRUE WHERE user_id=?`,
      [hash,rows[0].user_id]);
    res.json({success:true,message:"Student password reset successfully."});
  } catch(error) {
    console.error("Reset password error:",error);
    res.status(500).json({success:false,message:"Unable to reset student password."});
  }
});

// DELETE
router.delete("/:id", authenticateToken, requireAdmin, async (req,res) => {
  let connection;
  try {
    const id=positiveInt(req.params.id);
    if(!id) return res.status(400).json({success:false,message:"Invalid student ID."});
    const [rows]=await pool.execute(`SELECT user_id FROM students WHERE student_id=? LIMIT 1`,[id]);
    if(!rows.length) return res.status(404).json({success:false,message:"Student not found."});
    connection=await pool.getConnection();
    await connection.beginTransaction();
    await connection.execute(`DELETE FROM students WHERE student_id=?`,[id]);
    await connection.execute(`DELETE FROM users WHERE user_id=?`,[rows[0].user_id]);
    await connection.commit();
    res.json({success:true,message:"Student deleted successfully."});
  } catch(error) {
    if(connection) await connection.rollback();
    console.error("Delete student error:",error);
    res.status(500).json({success:false,message:"Unable to delete student."});
  } finally {
    if(connection) connection.release();
  }
});

module.exports=router;
