const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const config = require("./config");

async function ensureSchema(conn) {
  const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
  const patchPath = path.join(__dirname, "..", "database", "schema_patch.sql");

  // schema.sql contains CREATE DATABASE/USE and many CREATE TABLE/INSERT IGNORE
  // statements. It must be sent through query() with multipleStatements enabled,
  // not execute(), because MySQL prepared statements do not support DDL like USE.
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  await conn.query(schemaSql);

  if (fs.existsSync(patchPath)) {
    const patchSql = fs.readFileSync(patchPath, "utf8");
    await conn.query(patchSql);
  }
}

async function user(conn, loginId, password, fullName, email, role) {
  const hash = await bcrypt.hash(password, 10);
  const [rows] = await conn.query(
    "SELECT user_id FROM users WHERE login_id=? LIMIT 1",
    [loginId]
  );

  if (rows.length) {
    await conn.query(
      `UPDATE users
       SET password_hash=?, full_name=?, email=?, role=?, is_active=TRUE, must_change_password=FALSE
       WHERE user_id=?`,
      [hash, fullName, email, role, rows[0].user_id]
    );
    return rows[0].user_id;
  }

  const [r] = await conn.query(
    `INSERT INTO users(login_id,password_hash,full_name,email,role,is_active,must_change_password)
     VALUES(?,?,?,?,?,TRUE,FALSE)`,
    [loginId, hash, fullName, email, role]
  );
  return r.insertId;
}

async function seed() {
  let conn;
  try {
    conn = await mysql.createConnection({
      ...config.db,
      multipleStatements: true
    });

    console.log("Checking database schema...");
    await ensureSchema(conn);
    console.log("Database schema ready.");

    const departments = [
      ["CSE", "Computer Science and Engineering"],
      ["IT", "Information Technology"],
      ["AIDS", "Artificial Intelligence and Data Science"],
      ["AIML", "Artificial Intelligence and Machine Learning"],
      ["ECE", "Electronics and Communication Engineering"],
      ["EEE", "Electrical and Electronics Engineering"],
      ["MECH", "Mechanical Engineering"],
      ["CIVIL", "Civil Engineering"]
    ];

    for (const [code, name] of departments) {
      await conn.query(
        `INSERT INTO departments(department_code,department_name,description,is_active)
         VALUES(?,?,?,TRUE)
         ON DUPLICATE KEY UPDATE department_name=VALUES(department_name),
                                 description=VALUES(description),
                                 is_active=TRUE`,
        [code, name, `${name} Department`]
      );
    }

    const [deps] = await conn.query(
      `SELECT department_id,department_code,department_name
       FROM departments WHERE is_active=TRUE ORDER BY department_id`
    );
    if (!deps.length) throw new Error("No departments available.");

    const depMap = Object.fromEntries(deps.map(d => [d.department_code, d.department_id]));

    // Always reset demo credentials to known working passwords.
    const adminId = await user(
      conn, "admin", "Admin@123", "AJV Administrator", "admin@ajv.ac.in", "ADMIN"
    );

    const facultyUsers = [];
    for (let i = 1; i <= 10; i++) {
      const login = `faculty${String(i).padStart(2, "0")}`;
      const id = await user(
        conn, login, "Faculty@123", `AJV Faculty ${i}`,
        `${login}@ajv.ac.in`, "FACULTY"
      );
      facultyUsers.push(id);
    }

    const studentUsers = [];
    for (let i = 1; i <= 30; i++) {
      const login = `STU${String(i).padStart(3, "0")}`;
      const id = await user(
        conn, login, "Student@123", `AJV Student ${i}`,
        `student${String(i).padStart(3, "0")}@ajv.ac.in`, "STUDENT"
      );
      studentUsers.push(id);
    }

    const [courses] = await conn.query(
      `SELECT course_id,course_code,course_name,department_id,semester,credits
       FROM courses ORDER BY course_id`
    );
    if (!courses.length) throw new Error("No courses found after schema initialization.");

    // Faculty profiles.
    const facultyIds = [];
    for (let i = 0; i < facultyUsers.length; i++) {
      const uid = facultyUsers[i];
      const dep = deps[i % deps.length].department_id;
      const emp = `AJV-FAC-${String(i + 1).padStart(3, "0")}`;
      const phone = `900000${String(i + 1).padStart(4, "0")}`;
      const [rows] = await conn.query(
        "SELECT faculty_id FROM faculty WHERE user_id=? LIMIT 1", [uid]
      );
      let fid;
      if (rows.length) {
        fid = rows[0].faculty_id;
        await conn.query(
          `UPDATE faculty SET employee_number=?,department_id=?,designation=?,qualification=?,joining_date=?,phone=?
           WHERE faculty_id=?`,
          [emp, dep, "Assistant Professor", "M.E.", "2025-06-01", phone, fid]
        );
      } else {
        const [r] = await conn.query(
          `INSERT INTO faculty(user_id,employee_number,department_id,designation,qualification,joining_date,phone)
           VALUES(?,?,?,?,?,?,?)`,
          [uid, emp, dep, "Assistant Professor", "M.E.", "2025-06-01", phone]
        );
        fid = r.insertId;
      }
      facultyIds.push(fid);
    }

    // Student profiles.
    const studentIds = [];
    for (let i = 0; i < studentUsers.length; i++) {
      const uid = studentUsers[i];
      const dep = deps[i % deps.length].department_id;
      const reg = `AJV${String(i + 1).padStart(3, "0")}`;
      const phone = `910000${String(i + 1).padStart(4, "0")}`;
      const year = (i % 4) + 1;
      const semester = ((i % 8) + 1);
      const [rows] = await conn.query(
        "SELECT student_id FROM students WHERE user_id=? LIMIT 1", [uid]
      );
      let sid;
      if (rows.length) {
        sid = rows[0].student_id;
        await conn.query(
          `UPDATE students SET register_number=?,department_id=?,year_of_study=?,semester=?,admission_year=?,phone=?,address=?
           WHERE student_id=?`,
          [reg, dep, year, semester, 2026, phone, "AJV College Campus", sid]
        );
      } else {
        const [r] = await conn.query(
          `INSERT INTO students(user_id,register_number,department_id,year_of_study,semester,admission_year,phone,address)
           VALUES(?,?,?,?,?,?,?,?)`,
          [uid, reg, dep, year, semester, 2026, phone, "AJV College Campus"]
        );
        sid = r.insertId;
      }
      studentIds.push(sid);
    }

    // Give every faculty member at least 3 courses. Prefer their department,
    // then use a deterministic fallback so no faculty dashboard is empty.
    for (let i = 0; i < facultyIds.length; i++) {
      const fid = facultyIds[i];
      const departmentId = deps[i % deps.length].department_id;
      const preferred = courses.filter(c => Number(c.department_id) === Number(departmentId));
      const fallback = courses.slice((i * 3) % courses.length, (i * 3) % courses.length + 3);
      const selected = (preferred.length >= 3 ? preferred.slice(0, 3) : preferred.concat(fallback)).slice(0, 3);

      for (const c of selected) {
        await conn.query(
          `INSERT INTO faculty_courses(faculty_id,course_id,academic_year)
           VALUES(?,?,?)
           ON DUPLICATE KEY UPDATE academic_year=VALUES(academic_year)`,
          [fid, c.course_id, "2026-27"]
        );
      }
    }

    // Give every student 4 courses and assign each course to a faculty member.
    for (let i = 0; i < studentIds.length; i++) {
      const sid = studentIds[i];
      const departmentId = deps[i % deps.length].department_id;
      const preferred = courses.filter(c => Number(c.department_id) === Number(departmentId));
      const fallback = courses.slice(0, 4);
      const selected = (preferred.length >= 4 ? preferred.slice(0, 4) : preferred.concat(fallback)).slice(0, 4);

      for (let j = 0; j < selected.length; j++) {
        const c = selected[j];
        const fid = facultyIds[(i + j) % facultyIds.length];
        const facultyUserId = facultyUsers[(i + j) % facultyUsers.length];

        await conn.query(
          `INSERT INTO student_courses(student_id,course_id,academic_year,semester)
           VALUES(?,?,?,?)
           ON DUPLICATE KEY UPDATE semester=VALUES(semester),academic_year=VALUES(academic_year)`,
          [sid, c.course_id, "2026-27", c.semester]
        );

        await conn.query(
          `INSERT INTO student_faculty_assignments(student_id,faculty_id,course_id,assigned_by)
           VALUES(?,?,?,?)
           ON DUPLICATE KEY UPDATE assigned_by=VALUES(assigned_by)`,
          [sid, fid, c.course_id, adminId]
        );

        const day = ((i + j) % 9) + 1;
        const date = `2026-09-${String(day).padStart(2, "0")}`;
        const status = ((i + j) % 6 === 0) ? "ABSENT" : "PRESENT";

        await conn.query(
          `INSERT INTO attendance(student_id,course_id,attendance_date,status,marked_by,remarks)
           VALUES(?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE status=VALUES(status),marked_by=VALUES(marked_by),remarks=VALUES(remarks)`,
          [sid, c.course_id, date, status, facultyUserId, "Seed attendance"]
        );

        const total = status === "ABSENT" ? 62 : 78;
        const internal = 22;
        const external = total - internal;
        const grade = total >= 90 ? "A+" : total >= 80 ? "A" : total >= 70 ? "B+" : total >= 60 ? "B" : "C";
        const gp = total >= 90 ? 10 : total >= 80 ? 9 : total >= 70 ? 8 : total >= 60 ? 7 : 6;

        await conn.query(
          `INSERT INTO results(student_id,course_id,semester,academic_year,internal_mark,external_mark,total_mark,grade,grade_point,result_status,updated_by)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             internal_mark=VALUES(internal_mark),external_mark=VALUES(external_mark),total_mark=VALUES(total_mark),
             grade=VALUES(grade),grade_point=VALUES(grade_point),result_status=VALUES(result_status),updated_by=VALUES(updated_by)`,
          [sid, c.course_id, c.semester, "2026-27", internal, external, total, grade, gp, "PASS", facultyUserId]
        );
      }
    }

    console.log("AJV CollegeConnect seed completed successfully.");
    console.log("Admin   : admin / Admin@123");
    console.log("Faculty : faculty01 ... faculty10 / Faculty@123");
    console.log("Student : STU001 ... STU030 / Student@123");
    console.log(`Created/updated ${facultyIds.length} faculty and ${studentIds.length} students with linked courses, assignments, attendance and results.`);
  } catch (e) {
    console.error("Seed error:", e.message);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

seed();
