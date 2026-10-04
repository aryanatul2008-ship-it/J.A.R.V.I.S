require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse incoming request payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend assets from /public
app.use(express.static(path.join(__dirname, '../public')));

// Minimal auth status endpoint for client bootstrapping
app.get('/api/auth/status', (req, res) => {
  // Defaults to unauthenticated until OAuth session flow is linked
  res.json({ authenticated: false });
});

// OAuth route placeholder
app.get('/auth/google', (req, res) => {
  res.status(501).send('Google OAuth authentication flow will be connected in subsequent steps.');
});

// Start Express HTTP server
app.listen(PORT, () => {
  console.log(`[J.A.R.V.I.S] Stark Command Centre server online at http://localhost:${PORT}`);
});
