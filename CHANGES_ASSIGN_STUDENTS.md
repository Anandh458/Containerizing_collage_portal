# AJV CollegeConnect – Assign Students update

## New feature
- Admin → **Assign Students** (`frontend/assign-students.html`): pick Student, Faculty, Course → Assign. Live list with search, Remove, KPI cards.
- Faculty → **My Students** now shows students directly assigned by Admin (plus existing course enrollments), with a Course column and distinct-student count.
- Login page uses a locally stored campus photo: `frontend/assets/images/college-campus-login.jpg`.

## Files added
- backend/routes/studentAssignmentRoutes.js
- frontend/assign-students.html
- frontend/assets/images/college-campus-login.jpg

## Files modified
- backend/server.js (mounts /api/student-assignments)
- backend/routes/facultyPortalRoutes.js (GET /api/faculty-portal/students includes direct assignments)
- frontend/faculty-dashboard.html (Course column, unique student KPI, empty state)
- frontend/admin-dashboard.html, students.html, faculty.html, courses.html, departments.html, academic-management.html (nav link + quick action)
- frontend/assets/professional-ui.css (login background image, overlay, mobile rules)
- database/schema.sql, database/schema_patch.sql

## Database
New table `student_faculty_assignments` (assignment_id, student_id, faculty_id, course_id, assigned_by, created_at),
UNIQUE(student_id, faculty_id, course_id), FKs to students/faculty/courses (ON DELETE CASCADE – removes assignment rows only).
Existing installs: run `database/schema_patch.sql` OR just start the server – the table is auto-created if missing.
No changes to users/auth tables, login flow or DB connection settings.

## API (Admin JWT required)
- GET    /api/student-assignments/options
- GET    /api/student-assignments
- POST   /api/student-assignments  { studentId, facultyId, courseId }
- DELETE /api/student-assignments/:id

## Tested
Admin & Faculty login, assign, duplicate block, remove, faculty My Students sync, all existing admin/faculty endpoints, desktop + mobile UI – no console errors.
