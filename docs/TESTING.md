# J.A.R.V.I.S — Manual Verification & Testing Checklist

This document details the complete end-to-end testing procedures for J.A.R.V.I.S (Stark Command Centre). Each test scenario specifies prerequisites, execution steps, expected outcomes, and verification criteria.

---

## Pre-Flight Checklist
- Server running: `node server/index.js` on `http://localhost:3000`
- PostgreSQL database accessible and migrations applied
- `.env` configured with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SESSION_SECRET`
- Viewports to verify:
  - Mobile: 360px × 640px
  - Tablet: 768px × 1024px
  - Desktop: 1280px × 800px

---

## Test Scenarios

### 1. Login & Boot Sequence
- **Objective:** Verify OAuth 2.0 flow and transition from system boot sequence to live command centre.
- **Steps:**
  1. Open browser in incognito mode to `http://localhost:3000`.
  2. Observe the logged-out terminal boot screen (`// SYSTEM BOOT SEQUENCE • AUTHENTICATION REQUIRED`).
  3. Click **"CONNECT GOOGLE"**.
  4. Grant required Calendar and Drive scopes on Google's consent screen.
  5. Upon redirection back to `/`, observe authentication completion.
- **Expected Outcome:**
  - Split-screen HUD layout appears (Console on left, Live Preview on right).
  - Top header displays user name and active clock ticker.
  - Integration chips (`CALENDAR`, `DRIVE`, `TELEGRAM`, `AI CORE`) display live health status.
  - Welcome greeting appears in console: `"Stark Command Centre online. Awaiting your command."`
  - Zero secrets or access/refresh tokens present in local storage or network responses.

---

### 2. Create Event with Missing Time (Must Ask for Clarification)
- **Objective:** Ensure JARVIS never guesses ambiguous event times and asks a single clarifying question without executing the tool.
- **Steps:**
  1. In the console input `#in`, type:
     ```text
     Schedule a meeting with Pepper Potts
     ```
  2. Press **Send** (or Enter).
- **Expected Outcome:**
  - In-chat status indicator turns to busy (`JARVIS PROCESSING`).
  - No `create_calendar_event` tool step is executed.
  - JARVIS responds with a single polite clarifying question addressing the user as sir, e.g.:
    `"Certainly, sir. What date and time would you like to schedule the meeting with Ms. Potts?"`
  - Action log shows zero completed actions.

---

### 3. Create Event
- **Objective:** Verify ISO 8601 relative time resolution, Google Calendar event creation, and automatic preview sync.
- **Steps:**
  1. In console input, type:
     ```text
     Schedule a meeting with Bruce Banner tomorrow at 4 PM
     ```
  2. Press **Send**.
- **Expected Outcome:**
  - Running step appears: `▶ Creating calendar event…` with animated spinner.
  - Step transitions to done: `✓ Created calendar event: Meeting with Bruce Banner`.
  - Preview panel automatically switches to the **Calendar** tab (`cal`).
  - The new event is highlighted/flashed in the list with `EVENT` tag, correct date/time, and a link to Google Calendar.
  - Action counter in console header increments by 1.

---

### 4. List Tomorrow's Events
- **Objective:** Retrieve and display scheduled agenda items for tomorrow.
- **Steps:**
  1. Click the quick-command chip **"Tomorrow’s schedule"** (or type `"What do I have scheduled for tomorrow?"`).
- **Expected Outcome:**
  - Running step appears: `▶ Listing calendar events…`.
  - Step completes with `✓ Retrieved N calendar events`.
  - JARVIS replies with a concise summary of tomorrow's schedule (including the meeting scheduled in Test 3).
  - Calendar preview tab updates and displays tomorrow's events grouped under `▸ Tomorrow (...)`.

---

### 5. Set a Reminder and Wait for it to Fire
- **Objective:** Create a scheduled reminder, verify preview rendering, and confirm live firing via SSE.
- **Steps:**
  1. Submit command:
     ```text
     Remind me to test reactor containment in 10 seconds
     ```
  2. Check the **Reminders** tab (`rem`).
  3. Wait 10 seconds for the scheduler worker to trigger the reminder.
- **Expected Outcome:**
  - Reminder is created and rendered in the Reminders tab with amber `REMINDER` tag and a **"Dismiss"** button.
  - Exactly at expiry, a high-priority `⚡ REMINDER ALERT:` banner appears in the console, accompanied by a toast notification.
  - Clicking **"Dismiss"** removes the reminder and syncs the database.

---

### 6. Upload a File to a New Folder
- **Objective:** Test `request_file_upload` tool flow, UI opening, drag-and-drop/selection, folder creation, and progress bar.
- **Steps:**
  1. Submit command:
     ```text
     Upload this document to my Drive in folder Arc Reactor Specs
     ```
  2. Observe Drive tab opens automatically with destination pre-set to `+ Create new folder…` and input populated with `Arc Reactor Specs`.
  3. Select a sample PDF or text file under 50 MB using **Choose file**.
  4. Click **Upload to Drive**.
- **Expected Outcome:**
  - Real-time progress bar advances from 0% to 100%.
  - Success banner indicates upload completion.
  - Drive view refreshes and displays the newly created folder containing the uploaded file.
  - Attempting to upload a file > 50 MB immediately triggers the friendly validation error: `"File exceeds the 50 MB limit."`

---

### 7. Find a File in Drive
- **Objective:** Perform full-text search against Drive files and display search results.
- **Steps:**
  1. Click quick chip **"Find file"** (submits `"Find the reactor design report"`).
- **Expected Outcome:**
  - Running step: `▶ Searching Drive…`.
  - Done step: `✓ Found N matching files in Drive`.
  - Live Preview switches to Drive tab with breadcrumb `Drive / search results for “reactor design report”`.
  - Matching items are displayed with direct **Open** links.
  - Clicking **"Show all files"** clears search and restores normal folder hierarchy.

---

### 8. Send a Telegram Message (Confirm & Cancel Flows)
- **Objective:** Verify consequential action safety net: messages are NEVER sent automatically without user confirmation.
- **Steps (Cancel Flow):**
  1. Ensure a contact named "Bruce" exists (or add via Comms tab invite link / contacts editor).
  2. Command: `"Send Bruce a Telegram message saying We need to calibrate the Hulkbuster."`
  3. Observe confirmation card rendered in console:
     - Shows recipient `"Bruce"`
     - Shows exact quoted text
     - Two buttons: `[Send]` and `[Cancel]`
  4. Click **[Cancel]**.
  5. Check **Comms** tab transmission history.
  6. Check **History** tab.
- **Expected Outcome (Cancel):**
  - Buttons immediately disable; card reflects `✕ TRANSMISSION CANCELLED`.
  - No message is sent to Telegram.
  - Comms tab shows entry with red `CANCELLED` tag.
  - History tab records `send_telegram_message` as `CANCELLED`.
- **Steps (Confirm Flow):**
  1. Command: `"Send Bruce a message saying Stark lab test commencing."`
  2. When card appears, click **[Send]**.
- **Expected Outcome (Confirm):**
  - Buttons disable; card displays `✓ TRANSMISSION CONFIRMED & SENT`.
  - Bot dispatches message to Telegram chat ID.
  - Comms history shows `SENT` tag with timestamp.
  - History tab logs `SUCCESS`.

---

### 9. The 3-Action Combo
- **Objective:** Verify multi-step reasoning, dependency ordering, and chaining across tools in a single command.
- **Steps:**
  1. Click quick chip **"Combo: 3 actions"**:
     ```text
     JARVIS, schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before it, and send Bruce a Telegram message about it
     ```
- **Expected Outcome:**
  - Step 1: `create_calendar_event` executes for tomorrow at 6:00 PM.
  - Step 2: `create_reminder` uses step 1's start time and executes for tomorrow at 5:30 PM (30 minutes prior).
  - Step 3: `send_telegram_message` stages a message mentioning the 6 PM meeting and prompts for user confirmation.
  - Confirmation card appears in chat.
  - JARVIS responds with a summary of all 3 actions.

---

### 10. Queueing Three Fast Commands
- **Objective:** Verify concurrency handling in `QUEUE` mode.
- **Steps:**
  1. Ensure mode button in queue bar displays `NEW COMMAND: QUEUE IT`.
  2. In rapid succession, submit three commands:
     - Command A: `"List my calendar events"`
     - Command B: `"List my upcoming reminders"`
     - Command C: `"Find reactor files"`
- **Expected Outcome:**
  - Command A starts executing; status dot pulses yellow `JARVIS PROCESSING`.
  - Commands B and C appear sequentially as chips in the queue bar (`#qs`).
  - Command input field `#in` remains responsive and unlocked.
  - When Command A completes, Command B automatically executes, followed by Command C.
  - Status returns to green `JARVIS ONLINE` once queue is empty.

---

### 11. Interrupt Mode
- **Objective:** Verify immediate AbortController cancellation of running commands in `INTERRUPT` mode.
- **Steps:**
  1. Click mode toggle button `#mode` so it reads `NEW COMMAND: INTERRUPT`.
  2. Submit a long command: `"Search drive for all technical documents"`.
  3. While it is processing, immediately submit: `"What time is it?"`.
- **Expected Outcome:**
  - Running HTTP stream for the first command is aborted immediately via `AbortController`.
  - Console prints: `"Previous operation cancelled"`.
  - The second command executes without delay and JARVIS responds with the current time.

---

### 12. Expired Google Token Handling
- **Objective:** Verify graceful error handling when Google OAuth tokens expire or are revoked.
- **Steps:**
  1. Manually simulate token expiry (or revoke access in Google Account permissions).
  2. Issue command: `"List my calendar events"`.
- **Expected Outcome:**
  - Step line turns red: `✕ AUTHENTICATION EXPIRED: Google authorization has expired. [Reconnect Google]`.
  - Reconnect banner appears at the top of the app.
  - Integration chip for `CALENDAR` turns red: `CALENDAR · AUTH EXPIRED`.
  - Clicking **"Reconnect Google"** launches the OAuth consent flow without crashing or trapping the UI.

---

### 13. System & Network Outages
- **Objective:** Verify resilience when external integrations (AI / Telegram / Network) are unreachable.
- **Steps:**
  1. Disconnect network or configure invalid Gemini API key.
  2. Issue any command.
- **Expected Outcome:**
  - Chat stream terminates cleanly without hanging: `"Connection to JARVIS lost"` or `"JARVIS reasoning core encountered an error"`.
  - Friendly error suggestion appears with next steps.
  - Queue proceeds to next pending item without deadlock.
  - Integration chips reflect `UNAVAILABLE`.
  - Live Preview tabs render error containers with functional **"RETRY"** buttons.

---

### 14. Voice Command Input & Auto-Send
- **Objective:** Verify speech-to-text recognition, interim transcript rendering, wake word cleanup, and automatic command dispatch.
- **Steps:**
  1. Click the round cyan microphone button next to the command input.
  2. Observe microphone button pulses with cyan glow and header indicator changes to `JARVIS LISTENING`.
  3. Speak clearly: `"Hey Jarvis, schedule a team sync tomorrow at 3 PM"`.
- **Expected Outcome:**
  - Live interim transcript displays in the input field as you speak.
  - On pause/completion, the transcript is cleaned: leading `"Hey Jarvis"` is stripped, first letter is capitalized: `"Schedule a team sync tomorrow at 3 PM"`.
  - With "Auto-send" toggle enabled (default), the command submits automatically through `window.queue.submit`.
  - Mic button and status indicator return to normal idle state.

---

### 15. Keyboard Shortcut (Ctrl+M) & Manual Stop
- **Objective:** Toggle voice listening state via keyboard shortcut and verify early stopping.
- **Steps:**
  1. Press `Ctrl+M` (or `Cmd+M` on macOS).
  2. Confirm listening starts (placeholder switches to `"Listening…"`).
  3. Press `Ctrl+M` again (or click the microphone button).
- **Expected Outcome:**
  - Recognition terminates immediately.
  - Placeholder restores to `"Give JARVIS a command…"`.
  - Status indicator returns to `JARVIS ONLINE`.

---

### 16. Spoken Replies (Text-to-Speech)
- **Objective:** Verify auditory feedback for JARVIS's final response messages.
- **Steps:**
  1. Click the **"SPOKEN REPLIES: OFF"** chip in the voice toolbar to turn it **ON** (`🔊 SPOKEN REPLIES: ON`).
  2. Submit command: `"What is the status of the arc reactor?"`.
  3. Listen to the audio output.
- **Expected Outcome:**
  - JARVIS speaks the final reply using an English male voice at rate 1.0, pitch 0.9.
  - Step lines, tool calls, and error codes are NOT read out aloud.
  - If the reply exceeds two sentences, only the first two sentences are spoken.
  - While JARVIS is speaking, speech recognition is held inactive to prevent acoustic feedback loops.

---

### 17. Voice Confirmation for Telegram Actions
- **Objective:** Confirm consequential actions using spoken voice commands.
- **Steps:**
  1. Submit: `"Send Bruce a Telegram message saying Lab calibration is complete"`.
  2. Wait for the confirmation card to render in the console.
  3. Notice the card displays: `Voice: Say 'confirm' or 'cancel'`.
  4. Press `Ctrl+M` and say: `"Confirm"` (or `"Send it"`).
- **Expected Outcome:**
  - The voice controller detects the short confirmation phrase and triggers the card's `[Send]` button.
  - The message is transmitted via Telegram and card turns into `✓ TRANSMISSION CONFIRMED & SENT`.
  - If the user says `"Cancel"`, the card cancels transmission.
  - Spoken sentences longer than two words do not trigger accidental confirmation.

---

### 18. Hands-Free Mode & Silence Timeout
- **Objective:** Verify continuous wake-word listening and automatic 60-second deactivation.
- **Steps:**
  1. Click **"HANDS-FREE: OFF"** to turn it **ON** (`HANDS-FREE: ON`).
  2. Observe the green pulsing indicator: `● LISTENING (SAY "JARVIS…")`.
  3. Speak background chatter without saying the wake word (e.g. `"The weather is nice today"`).
  4. Observe the command is ignored and not submitted.
  5. Say: `"Jarvis, what do I have scheduled for tomorrow?"`.
  6. Observe the command executes and, once complete, hands-free mode automatically resumes listening.
  7. Remain silent for 60 seconds (or switch browser tabs).
- **Expected Outcome:**
  - After 60 seconds of silence or upon tab hide, hands-free mode automatically deactivates with a notification: `"Hands-free mode deactivated after 60 seconds of silence, sir."`.

---

### 19. Speech Recognition Error Handling & Fallback
- **Objective:** Gracefully handle microphone denial, disconnection, and unsupported environments.
- **Steps:**
  1. Deny microphone access in browser site permissions.
  2. Click the microphone button.
- **Expected Outcome:**
  - Console prints: `⚠ Microphone access is blocked. Allow it in the browser's site settings.`.
  - Microphone button resets immediately and does not freeze the UI.
  - In unsupported browsers (e.g. Firefox), the mic button is hidden and `"Voice input needs Chrome or Edge."` is displayed.

---

## Accessibility & Responsive Verification Results

| Dimension / Requirement | Standard | Status | Verification Note |
|---|---|---|---|
| **Mobile (360px)** | Zero horizontal scroll | PASS | Wrapped layout, flex-wrap on headers, responsive 1-column cards |
| **Tablet (768px)** | Stacking under 860px | PASS | Console and Live Preview stack vertically with auto height |
| **Desktop (1280px)** | 2-Column Split Screen | PASS | Synchronized Console and Live Preview panels side-by-side |
| **Touch Targets** | Buttons & tabs ≥ 40px | PASS | Explicit `min-height: 40px` and inline-flex alignment on all buttons/tabs/inputs |
| **Focus Outlines** | Visible `:focus-visible` | PASS | High-contrast `outline: 2px solid var(--ok)` with 2px offset |
| **ARIA Live** | `#log` & `#voice-announcer` | PASS | `aria-live="polite"` configured on console and dedicated voice announcer |
| **Reduced Motion** | `@media (prefers-reduced-motion)` | PASS | Disables CSS animations, mic pulse ring, and SVG `<animateTransform>` tags |
| **Input Labels** | Form accessibility | PASS | All inputs, selects, mic button, and toggles have explicit `aria-label`s |
| **Voice Confirmation** | Consequential safety | PASS | Never bypasses confirmation; matches only strict 1–2 word confirm/cancel |

