# J.A.R.V.I.S — Stark Command Centre

Web-based personal AI assistant for Silicon Maze: Doomsday Edition. Allows users to type commands in plain English and execute real actions on Google Calendar, Google Drive, and Telegram, with a live synchronized preview pane.

## Tech Stack
- **Backend**: Node.js (18+) with Express (CommonJS)
- **Frontend**: Plain HTML, CSS, JavaScript (Vanilla, served from `/public`)
- **Database**: PostgreSQL (`pg`, `connect-pg-simple`)
- **Google APIs**: `googleapis` (OAuth 2.0)
- **AI**: Google Gemini (`@google/genai`) with function calling
- **Telegram**: `node-telegram-bot-api`
- **Security & Utils**: `express-session`, `helmet`, `express-rate-limit`, `multer`, `node-cron`, `dotenv`

## Project Structure
```text
server/
  index.js
  config.js
  db.js
  schema.sql
  middleware/
    auth.js
    errors.js
  routes/
    auth.js
    calendar.js
    reminders.js
    drive.js
    telegram.js
    command.js
    actions.js
    history.js
    events.js
  services/
    google.js
    calendar.js
    drive.js
    telegram.js
    reminders.js
    gemini.js
    tools.js
    crypto.js
    scheduler.js
public/
  index.html
  css/style.css
  js/
    app.js
    api.js
    chat.js
    queue.js
    preview.js
    upload.js
reference/
  jarvis-prototype.html
.env.example
.gitignore
package.json
README.md
```

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Run in production:
   ```bash
   npm start
   ```