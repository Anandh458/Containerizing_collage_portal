USE collegeconnect;

-- Safe patch for databases created from older CollegeConnect versions.
ALTER TABLE departments
ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;

-- Allows grade points such as 10.00.
ALTER TABLE results
MODIFY COLUMN grade_point DECIMAL(4,2);


-- =========================================================
-- Student <-> Faculty assignments (Admin -> Assign Students)
-- Also auto-created on startup by backend/routes/studentAssignmentRoutes.js
-- =========================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
