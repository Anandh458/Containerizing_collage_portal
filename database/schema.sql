-- =========================================================
-- CollegeConnect - Database Foundation
-- Sri Ramakrishna Institute of Technology
-- MySQL Database
-- =========================================================

-- Create database
CREATE DATABASE IF NOT EXISTS collegeconnect
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE collegeconnect;


-- =========================================================
-- 1. USERS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,

    login_id VARCHAR(50) NOT NULL UNIQUE,

    password_hash VARCHAR(255) NOT NULL,

    full_name VARCHAR(150) NOT NULL,

    email VARCHAR(150) UNIQUE,

    role ENUM('ADMIN', 'FACULTY', 'STUDENT') NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


-- =========================================================
-- 2. DEPARTMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS departments (
    department_id INT AUTO_INCREMENT PRIMARY KEY,

    department_code VARCHAR(20) NOT NULL UNIQUE,

    department_name VARCHAR(150) NOT NULL UNIQUE,

    description TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 3. STUDENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL UNIQUE,

    register_number VARCHAR(30) NOT NULL UNIQUE,

    department_id INT NOT NULL,

    year_of_study TINYINT NOT NULL,

    semester TINYINT NOT NULL,

    phone VARCHAR(20),

    date_of_birth DATE,

    gender VARCHAR(20),

    address TEXT,

    admission_year YEAR,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_student_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_student_department
        FOREIGN KEY (department_id)
        REFERENCES departments(department_id)
        ON DELETE RESTRICT
);


-- =========================================================
-- 4. FACULTY
-- =========================================================

CREATE TABLE IF NOT EXISTS faculty (
    faculty_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL UNIQUE,

    employee_number VARCHAR(30) NOT NULL UNIQUE,

    department_id INT NOT NULL,

    designation VARCHAR(100),

    phone VARCHAR(20),

    qualification VARCHAR(150),

    joining_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_faculty_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_faculty_department
        FOREIGN KEY (department_id)
        REFERENCES departments(department_id)
        ON DELETE RESTRICT
);


-- =========================================================
-- 5. COURSES
-- =========================================================

CREATE TABLE IF NOT EXISTS courses (
    course_id INT AUTO_INCREMENT PRIMARY KEY,

    course_code VARCHAR(30) NOT NULL UNIQUE,

    course_name VARCHAR(150) NOT NULL,

    department_id INT NOT NULL,

    semester TINYINT NOT NULL,

    credits DECIMAL(3,1) NOT NULL DEFAULT 3.0,

    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_course_department
        FOREIGN KEY (department_id)
        REFERENCES departments(department_id)
        ON DELETE CASCADE
);


-- =========================================================
-- 6. FACULTY COURSE ASSIGNMENT
-- =========================================================

CREATE TABLE IF NOT EXISTS faculty_courses (
    faculty_course_id INT AUTO_INCREMENT PRIMARY KEY,

    faculty_id INT NOT NULL,

    course_id INT NOT NULL,

    academic_year VARCHAR(20) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_faculty_course_year
        (faculty_id, course_id, academic_year),

    CONSTRAINT fk_fc_faculty
        FOREIGN KEY (faculty_id)
        REFERENCES faculty(faculty_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_fc_course
        FOREIGN KEY (course_id)
        REFERENCES courses(course_id)
        ON DELETE CASCADE
);


-- =========================================================
-- 7. STUDENT COURSE ENROLLMENT
-- =========================================================

CREATE TABLE IF NOT EXISTS student_courses (
    student_course_id INT AUTO_INCREMENT PRIMARY KEY,

    student_id INT NOT NULL,

    course_id INT NOT NULL,

    academic_year VARCHAR(20) NOT NULL,

    semester TINYINT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_student_course_semester
        (student_id, course_id, academic_year, semester),

    CONSTRAINT fk_sc_student
        FOREIGN KEY (student_id)
        REFERENCES students(student_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_sc_course
        FOREIGN KEY (course_id)
        REFERENCES courses(course_id)
        ON DELETE CASCADE
);


-- =========================================================
-- 8. ATTENDANCE
-- =========================================================

CREATE TABLE IF NOT EXISTS attendance (
    attendance_id INT AUTO_INCREMENT PRIMARY KEY,

    student_id INT NOT NULL,

    course_id INT NOT NULL,

    attendance_date DATE NOT NULL,

    status ENUM('PRESENT', 'ABSENT', 'OD', 'LEAVE')
        NOT NULL DEFAULT 'PRESENT',

    marked_by INT,

    remarks VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_attendance
        (student_id, course_id, attendance_date),

    CONSTRAINT fk_attendance_student
        FOREIGN KEY (student_id)
        REFERENCES students(student_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_attendance_course
        FOREIGN KEY (course_id)
        REFERENCES courses(course_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_attendance_marked_by
        FOREIGN KEY (marked_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
);


-- =========================================================
-- 9. RESULTS
-- =========================================================

CREATE TABLE IF NOT EXISTS results (
    result_id INT AUTO_INCREMENT PRIMARY KEY,

    student_id INT NOT NULL,

    course_id INT NOT NULL,

    semester TINYINT NOT NULL,

    academic_year VARCHAR(20) NOT NULL,

    internal_mark DECIMAL(5,2) DEFAULT 0,

    external_mark DECIMAL(5,2) DEFAULT 0,

    total_mark DECIMAL(5,2) DEFAULT 0,

    grade VARCHAR(5),

    grade_point DECIMAL(4,2),

    result_status ENUM('PASS', 'FAIL', 'ARREAR', 'PENDING')
        DEFAULT 'PENDING',

    updated_by INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY unique_student_result
        (student_id, course_id, semester, academic_year),

    CONSTRAINT fk_result_student
        FOREIGN KEY (student_id)
        REFERENCES students(student_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_result_course
        FOREIGN KEY (course_id)
        REFERENCES courses(course_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_result_updated_by
        FOREIGN KEY (updated_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
);


-- =========================================================
-- 10. FEES
-- =========================================================

CREATE TABLE IF NOT EXISTS fees (
    fee_id INT AUTO_INCREMENT PRIMARY KEY,

    student_id INT NOT NULL,

    academic_year VARCHAR(20) NOT NULL,

    fee_type VARCHAR(100) NOT NULL,

    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,

    due_date DATE,

    description VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_fee_student
        FOREIGN KEY (student_id)
        REFERENCES students(student_id)
        ON DELETE CASCADE
);


-- =========================================================
-- 11. FEE PAYMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS fee_payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,

    fee_id INT NOT NULL,

    student_id INT NOT NULL,

    amount_paid DECIMAL(10,2) NOT NULL,

    payment_method ENUM(
        'DEMO',
        'CASH',
        'UPI',
        'CARD',
        'BANK_TRANSFER'
    ) DEFAULT 'DEMO',

    transaction_reference VARCHAR(100),

    payment_status ENUM(
        'SUCCESS',
        'PENDING',
        'FAILED'
    ) DEFAULT 'SUCCESS',

    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    remarks VARCHAR(255),

    CONSTRAINT fk_payment_fee
        FOREIGN KEY (fee_id)
        REFERENCES fees(fee_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_payment_student
        FOREIGN KEY (student_id)
        REFERENCES students(student_id)
        ON DELETE CASCADE
);


-- =========================================================
-- 12. ANNOUNCEMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS announcements (
    announcement_id INT AUTO_INCREMENT PRIMARY KEY,

    title VARCHAR(200) NOT NULL,

    message TEXT NOT NULL,

    created_by INT,

    target_role ENUM(
        'ALL',
        'ADMIN',
        'FACULTY',
        'STUDENT'
    ) DEFAULT 'ALL',

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_announcement_user
        FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
);


-- =========================================================
-- 13. PASSWORD CHANGE HISTORY
-- =========================================================

CREATE TABLE IF NOT EXISTS password_change_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    changed_by INT,

    CONSTRAINT fk_password_history_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_password_history_changed_by
        FOREIGN KEY (changed_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
);


-- =========================================================
-- 14. 15 DEPARTMENTS
-- =========================================================

INSERT IGNORE INTO departments
(department_code, department_name, description)
VALUES

('IT',
 'Information Technology',
 'Department of Information Technology'),

('CSE',
 'Computer Science and Engineering',
 'Department of Computer Science and Engineering'),

('AIDS',
 'Artificial Intelligence and Data Science',
 'Department of Artificial Intelligence and Data Science'),

('AIML',
 'Artificial Intelligence and Machine Learning',
 'Department of Artificial Intelligence and Machine Learning'),

('ECE',
 'Electronics and Communication Engineering',
 'Department of Electronics and Communication Engineering'),

('EEE',
 'Electrical and Electronics Engineering',
 'Department of Electrical and Electronics Engineering'),

('MECH',
 'Mechanical Engineering',
 'Department of Mechanical Engineering'),

('CIVIL',
 'Civil Engineering',
 'Department of Civil Engineering'),

('CSBS',
 'Computer Science and Business Systems',
 'Department of Computer Science and Business Systems'),

('CYBER',
 'Cyber Security',
 'Department of Cyber Security'),

('BME',
 'Biomedical Engineering',
 'Department of Biomedical Engineering'),

('CHEM',
 'Chemical Engineering',
 'Department of Chemical Engineering'),

('AUTO',
 'Automobile Engineering',
 'Department of Automobile Engineering'),

('RA',
 'Robotics and Automation',
 'Department of Robotics and Automation'),

('BIOTECH',
 'Biotechnology',
 'Department of Biotechnology');


-- =========================================================
-- 15. COURSES / SUBJECTS
-- 5 COURSES FOR EACH DEPARTMENT
-- TOTAL = 75 COURSES
-- =========================================================


-- -------------------------
-- INFORMATION TECHNOLOGY
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'IT101', 'Programming in C', department_id, 1, 4
FROM departments WHERE department_code = 'IT';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'IT102', 'Python Programming', department_id, 2, 4
FROM departments WHERE department_code = 'IT';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'IT201', 'Database Management Systems', department_id, 3, 4
FROM departments WHERE department_code = 'IT';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'IT202', 'Web Technology', department_id, 4, 3
FROM departments WHERE department_code = 'IT';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'IT301', 'Cloud Computing', department_id, 5, 3
FROM departments WHERE department_code = 'IT';


-- -------------------------
-- COMPUTER SCIENCE
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSE101', 'Programming Fundamentals', department_id, 1, 4
FROM departments WHERE department_code = 'CSE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSE102', 'Data Structures', department_id, 2, 4
FROM departments WHERE department_code = 'CSE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSE201', 'Operating Systems', department_id, 3, 4
FROM departments WHERE department_code = 'CSE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSE202', 'Computer Networks', department_id, 4, 4
FROM departments WHERE department_code = 'CSE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSE301', 'Software Engineering', department_id, 5, 3
FROM departments WHERE department_code = 'CSE';


-- -------------------------
-- AI & DATA SCIENCE
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIDS101', 'Introduction to AI', department_id, 1, 3
FROM departments WHERE department_code = 'AIDS';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIDS102', 'Statistics for Data Science', department_id, 2, 4
FROM departments WHERE department_code = 'AIDS';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIDS201', 'Machine Learning', department_id, 3, 4
FROM departments WHERE department_code = 'AIDS';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIDS202', 'Data Visualization', department_id, 4, 3
FROM departments WHERE department_code = 'AIDS';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIDS301', 'Big Data Analytics', department_id, 5, 3
FROM departments WHERE department_code = 'AIDS';


-- -------------------------
-- AI & MACHINE LEARNING
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIML101', 'AI Fundamentals', department_id, 1, 3
FROM departments WHERE department_code = 'AIML';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIML102', 'Machine Learning Fundamentals', department_id, 2, 4
FROM departments WHERE department_code = 'AIML';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIML201', 'Deep Learning', department_id, 3, 4
FROM departments WHERE department_code = 'AIML';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIML202', 'Natural Language Processing', department_id, 4, 3
FROM departments WHERE department_code = 'AIML';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AIML301', 'Computer Vision', department_id, 5, 3
FROM departments WHERE department_code = 'AIML';


-- -------------------------
-- ECE
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'ECE101', 'Electronic Devices', department_id, 1, 4
FROM departments WHERE department_code = 'ECE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'ECE102', 'Digital Electronics', department_id, 2, 4
FROM departments WHERE department_code = 'ECE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'ECE201', 'Signals and Systems', department_id, 3, 4
FROM departments WHERE department_code = 'ECE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'ECE202', 'Communication Systems', department_id, 4, 4
FROM departments WHERE department_code = 'ECE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'ECE301', 'Embedded Systems', department_id, 5, 3
FROM departments WHERE department_code = 'ECE';


-- -------------------------
-- EEE
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'EEE101', 'Circuit Theory', department_id, 1, 4
FROM departments WHERE department_code = 'EEE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'EEE102', 'Electrical Machines', department_id, 2, 4
FROM departments WHERE department_code = 'EEE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'EEE201', 'Power Systems', department_id, 3, 4
FROM departments WHERE department_code = 'EEE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'EEE202', 'Control Systems', department_id, 4, 4
FROM departments WHERE department_code = 'EEE';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'EEE301', 'Renewable Energy Systems', department_id, 5, 3
FROM departments WHERE department_code = 'EEE';


-- -------------------------
-- MECHANICAL
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'MECH101', 'Engineering Mechanics', department_id, 1, 4
FROM departments WHERE department_code = 'MECH';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'MECH102', 'Thermodynamics', department_id, 2, 4
FROM departments WHERE department_code = 'MECH';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'MECH201', 'Fluid Mechanics', department_id, 3, 4
FROM departments WHERE department_code = 'MECH';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'MECH202', 'Manufacturing Technology', department_id, 4, 4
FROM departments WHERE department_code = 'MECH';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'MECH301', 'CAD and CAM', department_id, 5, 3
FROM departments WHERE department_code = 'MECH';


-- -------------------------
-- CIVIL
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CIVIL101', 'Engineering Geology', department_id, 1, 3
FROM departments WHERE department_code = 'CIVIL';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CIVIL102', 'Surveying', department_id, 2, 4
FROM departments WHERE department_code = 'CIVIL';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CIVIL201', 'Structural Engineering', department_id, 3, 4
FROM departments WHERE department_code = 'CIVIL';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CIVIL202', 'Environmental Engineering', department_id, 4, 3
FROM departments WHERE department_code = 'CIVIL';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CIVIL301', 'Transportation Engineering', department_id, 5, 3
FROM departments WHERE department_code = 'CIVIL';


-- -------------------------
-- CSBS
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSBS101', 'Business Computing', department_id, 1, 3
FROM departments WHERE department_code = 'CSBS';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSBS102', 'Programming for Business', department_id, 2, 4
FROM departments WHERE department_code = 'CSBS';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSBS201', 'Database Systems', department_id, 3, 4
FROM departments WHERE department_code = 'CSBS';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSBS202', 'Business Analytics', department_id, 4, 3
FROM departments WHERE department_code = 'CSBS';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CSBS301', 'Enterprise Systems', department_id, 5, 3
FROM departments WHERE department_code = 'CSBS';


-- -------------------------
-- CYBER SECURITY
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CYBER101', 'Cyber Security Fundamentals', department_id, 1, 3
FROM departments WHERE department_code = 'CYBER';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CYBER102', 'Network Security', department_id, 2, 4
FROM departments WHERE department_code = 'CYBER';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CYBER201', 'Ethical Security Concepts', department_id, 3, 3
FROM departments WHERE department_code = 'CYBER';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CYBER202', 'Digital Forensics', department_id, 4, 3
FROM departments WHERE department_code = 'CYBER';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CYBER301', 'Cloud Security', department_id, 5, 3
FROM departments WHERE department_code = 'CYBER';


-- -------------------------
-- BIOMEDICAL
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BME101', 'Biomedical Instrumentation', department_id, 1, 4
FROM departments WHERE department_code = 'BME';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BME102', 'Human Anatomy', department_id, 2, 3
FROM departments WHERE department_code = 'BME';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BME201', 'Medical Electronics', department_id, 3, 4
FROM departments WHERE department_code = 'BME';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BME202', 'Biomedical Signal Processing', department_id, 4, 4
FROM departments WHERE department_code = 'BME';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BME301', 'Medical Imaging', department_id, 5, 3
FROM departments WHERE department_code = 'BME';


-- -------------------------
-- CHEMICAL
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CHEM101', 'Chemical Process Principles', department_id, 1, 4
FROM departments WHERE department_code = 'CHEM';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CHEM102', 'Chemical Thermodynamics', department_id, 2, 4
FROM departments WHERE department_code = 'CHEM';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CHEM201', 'Heat Transfer', department_id, 3, 4
FROM departments WHERE department_code = 'CHEM';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CHEM202', 'Mass Transfer', department_id, 4, 4
FROM departments WHERE department_code = 'CHEM';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'CHEM301', 'Process Control', department_id, 5, 3
FROM departments WHERE department_code = 'CHEM';


-- -------------------------
-- AUTOMOBILE
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AUTO101', 'Automobile Engineering Basics', department_id, 1, 3
FROM departments WHERE department_code = 'AUTO';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AUTO102', 'Automotive Engines', department_id, 2, 4
FROM departments WHERE department_code = 'AUTO';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AUTO201', 'Vehicle Dynamics', department_id, 3, 4
FROM departments WHERE department_code = 'AUTO';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AUTO202', 'Automotive Electronics', department_id, 4, 3
FROM departments WHERE department_code = 'AUTO';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'AUTO301', 'Electric Vehicles', department_id, 5, 3
FROM departments WHERE department_code = 'AUTO';


-- -------------------------
-- ROBOTICS AND AUTOMATION
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'RA101', 'Robotics Fundamentals', department_id, 1, 3
FROM departments WHERE department_code = 'RA';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'RA102', 'Sensors and Actuators', department_id, 2, 4
FROM departments WHERE department_code = 'RA';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'RA201', 'Industrial Robotics', department_id, 3, 4
FROM departments WHERE department_code = 'RA';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'RA202', 'Automation Systems', department_id, 4, 4
FROM departments WHERE department_code = 'RA';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'RA301', 'Robot Programming', department_id, 5, 3
FROM departments WHERE department_code = 'RA';


-- -------------------------
-- BIOTECHNOLOGY
-- -------------------------

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BIOTECH101', 'Cell Biology', department_id, 1, 3
FROM departments WHERE department_code = 'BIOTECH';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BIOTECH102', 'Biochemistry', department_id, 2, 4
FROM departments WHERE department_code = 'BIOTECH';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BIOTECH201', 'Genetic Engineering', department_id, 3, 4
FROM departments WHERE department_code = 'BIOTECH';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BIOTECH202', 'Microbiology', department_id, 4, 3
FROM departments WHERE department_code = 'BIOTECH';

INSERT IGNORE INTO courses
(course_code, course_name, department_id, semester, credits)
SELECT 'BIOTECH301', 'Bioprocess Engineering', department_id, 5, 3
FROM departments WHERE department_code = 'BIOTECH';


-- =========================================================
-- FINAL CHECK
-- =========================================================

SELECT 'CollegeConnect database created successfully!' AS message;

SELECT COUNT(*) AS total_departments
FROM departments;

SELECT COUNT(*) AS total_courses
FROM courses;

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
