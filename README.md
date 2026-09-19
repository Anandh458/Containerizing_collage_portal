# AJV CollegeConnect

AJV CollegeConnect is a full-stack college management system built with Express.js, MySQL, and vanilla HTML/CSS/JavaScript.

## Included modules

- Bright responsive admin dashboard
- Student management: add, edit, activate/deactivate, delete, search
- Faculty management: add, edit, activate/deactivate, delete, search
- Department management with safe delete checks
- Course management
- Faculty-course assignment
- Student-course enrollment
- Faculty portal with attendance, results, profile, and password management
- Student portal with profile, courses, attendance, and results
- Database-backed campus image hero and login experience

## Installation

1. Install Node.js 18 or newer and MySQL 8 or newer.
2. Create the database and base data:

   ```sql
   SOURCE database/schema.sql;
   SOURCE database/schema_patch.sql;
   ```

   Or open both files in MySQL Workbench and run them in order. The schema creates the `collegeconnect` database, 15 departments, and the starter courses.
3. Create the environment file:

   ```bash
   cd backend
   cp .env.example .env
   ```

4. Edit `backend/.env` with the real local MySQL password and a long private JWT secret.
5. Install dependencies:

   ```bash
   npm install
   ```

## Environment variables

```text
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=collegeconnect
JWT_SECRET=replace_with_a_long_random_secret
```

## Demo data and login

After the schema is ready, run:

```bash
node seed.js
```

The seed is idempotent for the demo users and prints the same credentials each time:

```text
Admin   : admin / Admin@123
Faculty : faculty / Faculty@123
Student : STU001 / Student@123
```

## Run

From `backend/`:

```bash
npm start
```

Open **http://localhost:5000**. Use the Express URL rather than opening the HTML files with `file://`.

## What was fixed

- Login and database health checks now use the same shared MySQL pool as the route modules.
- Login input is trimmed and missing JWT configuration returns a clear JSON configuration error.
- The dashboard summary now reads student, faculty, department, course, and academic-record counts from MySQL.
- Department deletion now correctly reads MySQL count results and blocks deletion only when students, faculty, or courses actually use the department.
- Add Student loads active departments from the database, validates the selection, creates the user and student profile in one transaction, and returns JSON consistently.
- Fetch helpers now parse text safely before JSON parsing, preventing `Unexpected end of JSON input` on empty or non-JSON responses.
- Malformed JSON requests and unknown API routes return JSON instead of an HTML error page.
- Saved login state is parsed defensively on every portal page so a damaged local session redirects cleanly.
- Department, faculty, course, student, attendance, results, and enrollment features remain connected to their existing APIs and tables.

## UI changes

The shared visual system was rebuilt as a bright professional college SaaS interface: white surfaces, blue primary actions, cyan and violet accents, glass-like cards, responsive navigation, cleaner tables, modern forms, readable status badges, and a realistic campus image used for the login and hero surfaces. The image is presented as a generic campus visual and is not claimed to be the verified AJV campus.

## Security notes

- `backend/.env` is intentionally not included.
- Do not commit database passwords or JWT secrets.
- The database schema and seed data are preserved; the application does not reset the database on startup.