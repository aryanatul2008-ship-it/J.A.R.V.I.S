/**
 * index.js - Main Express server entrypoint
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const config = require('./config');
const db = require('./db');
const { errorHandler, notFoundHandler } = require('./middleware/errors');

const app = express();

// Trust reverse proxy headers in production deployments
if (config.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers with Content Security Policy allowing Google fonts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"]
    }
  }
}));

// Global rate limiting: max 120 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    code: 'rate_limited',
    message: 'Request rate limit exceeded. Please try again shortly.'
  }
});
app.use(globalLimiter);

// Payload body parsing limited to 1MB
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Persistent session management backed by PostgreSQL
app.use(session({
  store: new PgSession({
    pool: db.pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Serve frontend static assets from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Authentication and profile routes
const authRoutes = require('./routes/auth');
app.use(authRoutes);

// Calendar integration routes
const calendarRoutes = require('./routes/calendar');
app.use(calendarRoutes);

// Reminders routes
const remindersRoutes = require('./routes/reminders');
app.use(remindersRoutes);

// Google Drive routes
const driveRoutes = require('./routes/drive');
app.use(driveRoutes);

// Telegram contacts and transmission routes
const telegramRoutes = require('./routes/telegram');
app.use(telegramRoutes);

// Command agent reasoning route
const commandRoutes = require('./routes/command');
app.use(commandRoutes);

// Pending actions confirmation and cancellation routes
const actionsRoutes = require('./routes/actions');
app.use(actionsRoutes);

// Live Server-Sent Events stream
const { router: eventsRouter } = require('./routes/events');
app.use(eventsRouter);

// Action history routes
const historyRoutes = require('./routes/history');
app.use(historyRoutes);

// Integration status routes
const statusRoutes = require('./routes/status');
app.use(statusRoutes);

// Auth status endpoint for client bootstrapping
app.get('/api/auth/status', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ authenticated: true, userId: req.session.userId });
  }
  return res.json({ authenticated: false });
});

// 404 handler for undefined API routes
app.use('/api', notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

// Background services
const scheduler = require('./services/scheduler');
const telegramService = require('./services/telegram');

// Initialize database schema and listen
async function startServer() {
  try {
    await db.init();
    telegramService.init();
    scheduler.init();
    app.listen(config.PORT, () => {
      console.log(`[J.A.R.V.I.S] Stark Command Centre server online at http://localhost:${config.PORT}`);
    });
  } catch (err) {
    console.error('[FATAL] Server initialization failed:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
