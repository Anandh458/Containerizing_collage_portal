const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db");


function authenticateToken(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ")
    ? header.substring(7)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication token required." });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
}

function requireFaculty(req, res, next) {
  if (!req.user || req.user.role !== "FACULTY") {
    return res.status(403).json({ success: false, message: "Faculty access required." });
  }
  next();
}

async function getFaculty(userId) {
  const [rows] = await pool.query(`
    SELECT f.faculty_id, f.user_id, f.employee_number,
           f.department_id, d.department_name, f.designation,
           f.qualification, f.phone, f.joining_date,
           u.login_id, u.full_name, u.email, u.is_active
    FROM faculty f
    INNER JOIN users u ON u.user_id = f.user_id
    LEFT JOIN departments d ON d.department_id = f.department_id
    WHERE f.user_id = ?
    LIMIT 1
  `, [userId]);
  return rows[0] || null;
}

/* Profile */
router.get("/profile", authenticateToken, requireFaculty, async (req, res) => {
  try {
    const faculty = await getFaculty(req.user.userId);
    if (!faculty) return res.status(404).json({ success:false, message:"Faculty profile not found." });
    res.json({ success:true, faculty });
  } catch (e) {
    console.error("Faculty profile:", e);
    res.status(500).json({ success:false, message:"Unable to load faculty profile." });
  }
});

router.put("/profile", authenticateToken, requireFaculty, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const faculty = await getFaculty(req.user.userId);
    if (!faculty) return res.status(404).json({ success:false, message:"Faculty profile not found." });

    const { fullName, email, phone, qualification, designation } = req.body;
    if (!fullName || !email || !designation) {
      return res.status(400).json({ success:false, message:"Full name, email and designation are required." });
    }

    await connection.beginTransaction();
    await connection.query(
      `UPDATE users SET full_name=?, email=? WHERE user_id=?`,
      [fullName.trim(), email.trim(), req.user.userId]
    );
    await connection.query(
      `UPDATE faculty SET phone=?, qualification=?, designation=? WHERE faculty_id=?`,
      [phone ? phone.trim() : null, qualification ? qualification.trim() : null,
       designation.trim(), faculty.faculty_id]
    );
    await connection.commit();

    const updated = await getFaculty(req.user.userId);
    res.json({ success:true, message:"Profile updated successfully.", faculty:updated });
  } catch (e) {
    await connection.rollback();
    console.error("Faculty profile update:", e);
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success:false, message:"Email already exists." });
    }
    res.status(500).json({ success:false, message:"Unable to update faculty profile." });
  } finally {
    connection.release();
  }
});

/* Assigned courses */
router.get("/courses", authenticateToken, requireFaculty, async (req, res) => {
  try {
    const faculty = await getFaculty(req.user.userId);
    if (!faculty) return res.status(404).json({ success:false, message:"Faculty profile not found." });

    const [rows] = await pool.query(`
      SELECT fc.faculty_course_id, fc.course_id, fc.academic_year,
             c.course_code, c.course_name, c.semester, c.credits,
             c.department_id, d.department_name
      FROM faculty_courses fc
      INNER JOIN courses c ON c.course_id = fc.course_id
      LEFT JOIN departments d ON d.department_id = c.department_id
      WHERE fc.faculty_id = ?
      ORDER BY fc.academic_year DESC, c.semester, c.course_code
    `, [faculty.faculty_id]);

    res.json({ success:true, courses:rows });
  } catch (e) {
    console.error("Faculty courses:", e);
    res.status(500).json({ success:false, message:"Unable to load assigned courses." });
  }
});

/* Students in one assigned course */
router.get("/courses/:courseId/students", authenticateToken, requireFaculty, async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    if (!Number.isInteger(courseId)) return res.status(400).json({success:false,message:"Invalid course ID."});

    const faculty = await getFaculty(req.user.userId);
    if (!faculty) return res.status(404).json({success:false,message:"Faculty profile not found."});

    const [assigned] = await pool.query(`
      SELECT faculty_course_id FROM faculty_courses
      WHERE faculty_id=? AND course_id=?
      LIMIT 1
    `, [faculty.faculty_id, courseId]);

    if (!assigned.length) return res.status(403).json({success:false,message:"Course is not assigned to this faculty."});

    const [rows] = await pool.query(`
      SELECT s.student_id, s.register_number, u.login_id, u.full_name, u.email,
             s.department_id, d.department_name, s.year_of_study, s.semester,
             s.phone
      FROM student_courses sc
      INNER JOIN students s ON s.student_id=sc.student_id
      INNER JOIN users u ON u.user_id=s.user_id
      LEFT JOIN departments d ON d.department_id=s.department_id
      WHERE sc.course_id=?
      ORDER BY s.register_number
    `, [courseId]);

    res.json({success:true, courseId, students:rows});
  } catch(e) {
    console.error("Faculty students:", e);
    res.status(500).json({success:false,message:"Unable to load course students."});
  }
});

/* All students across assigned courses */
router.get("/students", authenticateToken, requireFaculty, async (req, res) => {
  try {
    const faculty = await getFaculty(req.user.userId);
    if (!faculty) return res.status(404).json({success:false,message:"Faculty profile not found."});

    // Students directly assigned by the Admin (Assign Students page) PLUS
    // students enrolled in the courses this faculty teaches (existing behaviour).
    const [rows] = await pool.query(`
      SELECT s.student_id, s.register_number, u.full_name, u.email,
             s.year_of_study, s.semester, d.department_name,
             c.course_id, c.course_code, c.course_name
      FROM student_faculty_assignments a
      INNER JOIN students s ON s.student_id=a.student_id
      INNER JOIN users u ON u.user_id=s.user_id
      INNER JOIN courses c ON c.course_id=a.course_id
      LEFT JOIN departments d ON d.department_id=s.department_id
      WHERE a.faculty_id=?
      UNION
      SELECT DISTINCT s.student_id, s.register_number, u.full_name, u.email,
             s.year_of_study, s.semester, d.department_name,
             c.course_id, c.course_code, c.course_name
      FROM faculty_courses fc
      INNER JOIN student_courses sc ON sc.course_id=fc.course_id
      INNER JOIN courses c ON c.course_id=fc.course_id
      INNER JOIN students s ON s.student_id=sc.student_id
      INNER JOIN users u ON u.user_id=s.user_id
      LEFT JOIN departments d ON d.department_id=s.department_id
      WHERE fc.faculty_id=?
      ORDER BY register_number, course_code
    `, [faculty.faculty_id, faculty.faculty_id]);

    const uniqueStudents = new Set(rows.map(r => r.student_id)).size;
    res.json({success:true, students:rows, uniqueStudents});
  } catch(e) {
    console.error("Faculty all students:",e);
    res.status(500).json({success:false,message:"Unable to load students."});
  }
});

/* Attendance list for a course/date */
router.get("/attendance", authenticateToken, requireFaculty, async (req, res) => {
  try {
    const courseId=Number(req.query.courseId);
    const date=req.query.date;
    if(!Number.isInteger(courseId)||!date) return res.status(400).json({success:false,message:"courseId and date are required."});

    const faculty=await getFaculty(req.user.userId);
    if(!faculty) return res.status(404).json({success:false,message:"Faculty profile not found."});

    const [assigned]=await pool.query(
      `SELECT faculty_course_id FROM faculty_courses WHERE faculty_id=? AND course_id=? LIMIT 1`,
      [faculty.faculty_id,courseId]
    );
    if(!assigned.length) return res.status(403).json({success:false,message:"Course is not assigned to this faculty."});

    const [rows]=await pool.query(`
      SELECT s.student_id,s.register_number,u.full_name,
             COALESCE(a.status,'PRESENT') AS status,a.remarks
      FROM student_courses sc
      INNER JOIN students s ON s.student_id=sc.student_id
      INNER JOIN users u ON u.user_id=s.user_id
      LEFT JOIN attendance a
        ON a.student_id=s.student_id AND a.course_id=sc.course_id AND a.attendance_date=?
      WHERE sc.course_id=?
      ORDER BY s.register_number
    `,[date,courseId]);

    res.json({success:true,courseId,date,students:rows});
  } catch(e) {
    console.error("Faculty attendance:",e);
    res.status(500).json({success:false,message:"Unable to load attendance."});
  }
});

/* Mark/upsert attendance */
router.post("/attendance", authenticateToken, requireFaculty, async (req, res) => {
  try {
    const {courseId, attendanceDate, records}=req.body;
    const cid=Number(courseId);
    if(!Number.isInteger(cid)||!attendanceDate||!Array.isArray(records)||!records.length)
      return res.status(400).json({success:false,message:"courseId, attendanceDate and records are required."});

    const faculty=await getFaculty(req.user.userId);
    if(!faculty) return res.status(404).json({success:false,message:"Faculty profile not found."});

    const [assigned]=await pool.query(
      `SELECT faculty_course_id FROM faculty_courses WHERE faculty_id=? AND course_id=? LIMIT 1`,
      [faculty.faculty_id,cid]
    );
    if(!assigned.length) return res.status(403).json({success:false,message:"Course is not assigned to this faculty."});

    const allowed=new Set(["PRESENT","ABSENT","OD","LEAVE"]);
    for(const r of records){
      const sid=Number(r.studentId);
      if(!Number.isInteger(sid)||!allowed.has(r.status)) continue;
      const [enrolled]=await pool.query(
        `SELECT student_course_id FROM student_courses WHERE student_id=? AND course_id=? LIMIT 1`,
        [sid,cid]
      );
      if(!enrolled.length) continue;
      await pool.query(`
        INSERT INTO attendance
          (student_id,course_id,attendance_date,status,marked_by,remarks)
        VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          status=VALUES(status),marked_by=VALUES(marked_by),remarks=VALUES(remarks)
      `,[sid,cid,attendanceDate,r.status,req.user.userId,r.remarks||null]);
    }

    res.json({success:true,message:"Attendance saved successfully."});
  } catch(e) {
    console.error("Mark attendance:",e);
    res.status(500).json({success:false,message:"Unable to save attendance."});
  }
});

/* Results for course */
router.get("/results", authenticateToken, requireFaculty, async (req,res)=>{
  try{
    const courseId=Number(req.query.courseId);
    const academicYear=req.query.academicYear||"2026-27";
    const semester=req.query.semester?Number(req.query.semester):null;
    if(!Number.isInteger(courseId)) return res.status(400).json({success:false,message:"courseId is required."});

    const faculty=await getFaculty(req.user.userId);
    if(!faculty) return res.status(404).json({success:false,message:"Faculty profile not found."});
    const [assigned]=await pool.query(`SELECT faculty_course_id FROM faculty_courses WHERE faculty_id=? AND course_id=? LIMIT 1`,[faculty.faculty_id,courseId]);
    if(!assigned.length) return res.status(403).json({success:false,message:"Course is not assigned to this faculty."});

    let sql=`
      SELECT s.student_id,s.register_number,u.full_name,
             sc.semester,sc.academic_year,
             r.result_id,r.internal_mark,r.external_mark,r.total_mark,
             r.grade,r.grade_point,r.result_status
      FROM student_courses sc
      INNER JOIN students s ON s.student_id=sc.student_id
      INNER JOIN users u ON u.user_id=s.user_id
      LEFT JOIN results r ON r.student_id=s.student_id
        AND r.course_id=sc.course_id
        AND r.semester=sc.semester
        AND r.academic_year=sc.academic_year
      WHERE sc.course_id=? AND sc.academic_year=?
    `;
    const params=[courseId,academicYear];
    if(semester){sql+=" AND sc.semester=?";params.push(semester);}
    sql+=" ORDER BY s.register_number";
    const [rows]=await pool.query(sql,params);
    res.json({success:true,courseId,academicYear,students:rows});
  }catch(e){
    console.error("Faculty results:",e);
    res.status(500).json({success:false,message:"Unable to load results."});
  }
});

/* Create/update result */
router.post("/results", authenticateToken, requireFaculty, async(req,res)=>{
  try{
    const {studentId,courseId,semester,academicYear,internalMark,externalMark,grade,gradePoint,resultStatus}=req.body;
    const sid=Number(studentId),cid=Number(courseId),sem=Number(semester);
    const internal=Number(internalMark||0), external=Number(externalMark||0);
    if(!Number.isInteger(sid)||!Number.isInteger(cid)||!Number.isInteger(sem)||!academicYear)
      return res.status(400).json({success:false,message:"studentId, courseId, semester and academicYear are required."});
    if(internal<0||external<0) return res.status(400).json({success:false,message:"Marks cannot be negative."});

    const faculty=await getFaculty(req.user.userId);
    if(!faculty) return res.status(404).json({success:false,message:"Faculty profile not found."});
    const [assigned]=await pool.query(`SELECT faculty_course_id FROM faculty_courses WHERE faculty_id=? AND course_id=? LIMIT 1`,[faculty.faculty_id,cid]);
    if(!assigned.length) return res.status(403).json({success:false,message:"Course is not assigned to this faculty."});

    const [enrolled]=await pool.query(`SELECT student_course_id FROM student_courses WHERE student_id=? AND course_id=? AND semester=? AND academic_year=? LIMIT 1`,[sid,cid,sem,academicYear]);
    if(!enrolled.length) return res.status(400).json({success:false,message:"Student is not enrolled in this course/semester."});

    const total=internal+external;
    await pool.query(`
      INSERT INTO results
        (student_id,course_id,semester,academic_year,internal_mark,external_mark,total_mark,grade,grade_point,result_status,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        internal_mark=VALUES(internal_mark),
        external_mark=VALUES(external_mark),
        total_mark=VALUES(total_mark),
        grade=VALUES(grade),
        grade_point=VALUES(grade_point),
        result_status=VALUES(result_status),
        updated_by=VALUES(updated_by)
    `,[sid,cid,sem,academicYear,internal,external,total,grade||null,gradePoint===""||gradePoint==null?null:Number(gradePoint),resultStatus||"PENDING",req.user.userId]);

    res.json({success:true,message:"Result saved successfully."});
  }catch(e){
    console.error("Faculty result save:",e);
    res.status(500).json({success:false,message:"Unable to save result."});
  }
});

/* Change own password */
router.patch("/change-password", authenticateToken, requireFaculty, async(req,res)=>{
  try{
    const {currentPassword,newPassword}=req.body;
    if(!currentPassword||!newPassword) return res.status(400).json({success:false,message:"Current and new password are required."});
    if(newPassword.length<8) return res.status(400).json({success:false,message:"New password must contain at least 8 characters."});

    const [users]=await pool.query(`SELECT password_hash FROM users WHERE user_id=? LIMIT 1`,[req.user.userId]);
    if(!users.length) return res.status(404).json({success:false,message:"User not found."});
    if(!(await bcrypt.compare(currentPassword,users[0].password_hash)))
      return res.status(401).json({success:false,message:"Current password is incorrect."});

    const hash=await bcrypt.hash(newPassword,10);
    await pool.query(`UPDATE users SET password_hash=?,must_change_password=FALSE WHERE user_id=?`,[hash,req.user.userId]);
    await pool.query(`INSERT INTO password_change_history(user_id,changed_by) VALUES (?,?)`,[req.user.userId,req.user.userId]);

    res.json({success:true,message:"Password changed successfully."});
  }catch(e){
    console.error("Faculty password change:",e);
    res.status(500).json({success:false,message:"Unable to change password."});
  }
});

module.exports=router;
