AJV CollegeConnect rebuild notes

Fixed:
1. Department search route is registered before /:id so /api/departments/search works correctly.
2. Student Add/Edit Department dropdown loads active departments from /api/departments.
3. Frontend fetch helpers now safely parse empty/non-JSON responses instead of throwing "Unexpected end of JSON input".
4. Malformed JSON request bodies return a JSON 400 error from Express.
5. Shared MySQL pool is used by routes.
6. .env is excluded; use backend/.env.example to create backend/.env locally.
7. Campus images were upscaled and sharpened for clearer display.

Important setup:
- Create backend/.env from backend/.env.example.
- Run the SQL files in database/ in MySQL Workbench.
- In backend/: npm install, then npm start.
- Open http://localhost:5000/.


UI UPDATE: Bright professional CollegeConnect UI applied across all pages. The generic campus hero image at frontend/assets/campus-hero.png is used for the login and hero surfaces only. Existing API/database functionality and page JavaScript were preserved, with defensive response parsing and session handling fixes applied where needed.
