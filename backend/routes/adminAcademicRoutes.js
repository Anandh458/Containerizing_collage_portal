const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db");

function auth(req,res,next){
  const h=req.headers.authorization;
  if(!h || !h.startsWith("Bearer ")) return res.status(401).json({success:false,message:"Authentication token required."});
  try{
    req.user=jwt.verify(h.slice(7),process.env.JWT_SECRET);
    if(req.user.role!=="ADMIN") return res.status(403).json({success:false,message:"Admin access required."});
    next();
  }catch{
    return res.status(401).json({success:false,message:"Invalid or expired token."});
  }
}

function positiveInt(v){ const n=Number(v); return Number.isInteger(n) && n>0 ? n : null; }

router.get("/options",auth,async(req,res)=>{
  try{
    const [faculty]=await pool.query(`
      SELECT f.faculty_id,u.full_name,f.employee_number
      FROM faculty f INNER JOIN users u ON u.user_id=f.user_id
      WHERE u.is_active=1 ORDER BY u.full_name
    `);
    const [students]=await pool.query(`
      SELECT s.student_id,s.register_number,u.full_name
      FROM students s INNER JOIN users u ON u.user_id=s.user_id
      WHERE u.is_active=1 ORDER BY s.register_number
    `);
    const [courses]=await pool.query(`
      SELECT c.course_id,c.course_code,c.course_name,c.semester,c.credits
      FROM courses c ORDER BY c.course_code
    `);
    res.json({success:true,faculty,students,courses});
  }catch(e){
    console.error("Academic options:",e);
    res.status(500).json({success:false,message:"Unable to load academic options."});
  }
});

router.get("/assignments",auth,async(req,res)=>{
  try{
    const [rows]=await pool.query(`
      SELECT fc.faculty_course_id,fc.faculty_id,fc.course_id,fc.academic_year,
             u.full_name,f.employee_number,c.course_code,c.course_name
      FROM faculty_courses fc
      INNER JOIN faculty f ON f.faculty_id=fc.faculty_id
      INNER JOIN users u ON u.user_id=f.user_id
      INNER JOIN courses c ON c.course_id=fc.course_id
      ORDER BY u.full_name,c.course_code,fc.academic_year DESC
    `);
    res.json({success:true,assignments:rows});
  }catch(e){
    console.error("Assignments:",e);
    res.status(500).json({success:false,message:"Unable to load faculty assignments."});
  }
});

router.post("/assignments",auth,async(req,res)=>{
  try{
    const facultyId=positiveInt(req.body.facultyId),courseId=positiveInt(req.body.courseId);
    const academicYear=String(req.body.academicYear||"").trim();
    if(!facultyId||!courseId||!academicYear) return res.status(400).json({success:false,message:"Faculty, course and academic year are required."});
    const [[f],[c]]=await Promise.all([
      pool.query("SELECT faculty_id FROM faculty WHERE faculty_id=?",[facultyId]),
      pool.query("SELECT course_id FROM courses WHERE course_id=?",[courseId])
    ]);
    if(!f.length) return res.status(400).json({success:false,message:"Faculty not found."});
    if(!c.length) return res.status(400).json({success:false,message:"Course not found."});
    await pool.query(`
      INSERT INTO faculty_courses(faculty_id,course_id,academic_year)
      VALUES(?,?,?)
      ON DUPLICATE KEY UPDATE academic_year=VALUES(academic_year)
    `,[facultyId,courseId,academicYear]);
    res.json({success:true,message:"Course assigned to faculty successfully."});
  }catch(e){
    console.error("Assign course:",e);
    if(e.code==="ER_DUP_ENTRY") return res.status(409).json({success:false,message:"This faculty-course assignment already exists."});
    res.status(500).json({success:false,message:"Unable to assign course."});
  }
});

router.delete("/assignments/:id",auth,async(req,res)=>{
  try{
    const id=positiveInt(req.params.id);
    if(!id) return res.status(400).json({success:false,message:"Invalid assignment ID."});
    const [r]=await pool.query("DELETE FROM faculty_courses WHERE faculty_course_id=?",[id]);
    if(!r.affectedRows) return res.status(404).json({success:false,message:"Assignment not found."});
    res.json({success:true,message:"Faculty course assignment removed."});
  }catch(e){
    console.error("Delete assignment:",e);
    res.status(500).json({success:false,message:"Unable to remove assignment."});
  }
});

router.get("/enrollments",auth,async(req,res)=>{
  try{
    const [rows]=await pool.query(`
      SELECT sc.student_course_id,sc.student_id,sc.course_id,sc.academic_year,sc.semester,
             s.register_number,u.full_name,c.course_code,c.course_name
      FROM student_courses sc
      INNER JOIN students s ON s.student_id=sc.student_id
      INNER JOIN users u ON u.user_id=s.user_id
      INNER JOIN courses c ON c.course_id=sc.course_id
      ORDER BY s.register_number,c.course_code,sc.academic_year DESC,sc.semester
    `);
    res.json({success:true,enrollments:rows});
  }catch(e){
    console.error("Enrollments:",e);
    res.status(500).json({success:false,message:"Unable to load enrollments."});
  }
});

router.post("/enrollments",auth,async(req,res)=>{
  try{
    const studentId=positiveInt(req.body.studentId),courseId=positiveInt(req.body.courseId);
    const semester=positiveInt(req.body.semester);
    const academicYear=String(req.body.academicYear||"").trim();
    if(!studentId||!courseId||!semester||!academicYear) return res.status(400).json({success:false,message:"Student, course, semester and academic year are required."});
    const [[s],[c]]=await Promise.all([
      pool.query("SELECT student_id FROM students WHERE student_id=?",[studentId]),
      pool.query("SELECT course_id,semester FROM courses WHERE course_id=?",[courseId])
    ]);
    if(!s.length) return res.status(400).json({success:false,message:"Student not found."});
    if(!c.length) return res.status(400).json({success:false,message:"Course not found."});
    await pool.query(`
      INSERT INTO student_courses(student_id,course_id,academic_year,semester)
      VALUES(?,?,?,?)
      ON DUPLICATE KEY UPDATE semester=VALUES(semester)
    `,[studentId,courseId,academicYear,semester]);
    res.json({success:true,message:"Course enrolled for student successfully."});
  }catch(e){
    console.error("Enroll student:",e);
    if(e.code==="ER_DUP_ENTRY") return res.status(409).json({success:false,message:"This student is already enrolled in that course for the same year and semester."});
    res.status(500).json({success:false,message:"Unable to enroll student."});
  }
});

router.delete("/enrollments/:id",auth,async(req,res)=>{
  try{
    const id=positiveInt(req.params.id);
    if(!id) return res.status(400).json({success:false,message:"Invalid enrollment ID."});
    const [r]=await pool.query("DELETE FROM student_courses WHERE student_course_id=?",[id]);
    if(!r.affectedRows) return res.status(404).json({success:false,message:"Enrollment not found."});
    res.json({success:true,message:"Student course enrollment removed."});
  }catch(e){
    console.error("Delete enrollment:",e);
    res.status(500).json({success:false,message:"Unable to remove enrollment."});
  }
});

module.exports=router;
