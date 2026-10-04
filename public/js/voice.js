/**
 * voice.js - Voice control (Speech-to-Text & Text-to-Speech) for J.A.R.V.I.S
 * Runs entirely in-browser using Web Speech API (SpeechRecognition & speechSynthesis).
 */

// Primary recognition language constant (easily customizable)
const SPEECH_LANG = 'en-IN';

// Session-scoped voice state (in-memory only, no localStorage per spec)
const voiceState = {
  isListening: false,
  isSpeaking: false,
  speakerEnabled: false,   // Default OFF
  autoSend: true,          // Default ON
  handsFree: false,        // Default OFF
  recognition: null,
  silenceTimer: null,
  isSupported: false,
  selectedVoice: null
};

/**
 * Announce status messages to screen readers via aria-live region.
 * @param {string} text
 */
function announceVoice(text) {
  const el = document.querySelector('#voice-announcer');
  if (el) {
    el.textContent = text;
  }
}

/**
 * Check if the browser supports Web Speech API SpeechRecognition.
 * @returns {boolean}
 */
function checkSpeechSupport() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Boolean(SpeechRecognition);
}

/**
 * Clean transcript: trim, capitalise first letter, and strip leading "Jarvis," or "Hey Jarvis".
 * @param {string} raw
 * @returns {string}
 */
function cleanTranscript(raw) {
  if (!raw) return '';
  let text = raw.trim();

  // Strip leading "Jarvis" or "Hey Jarvis" with optional comma/whitespace
  text = text.replace(/^(hey\s+)?jarvis[,\s]*/i, '').trim();

  if (!text) return '';

  // Capitalise the first character
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Check and handle spoken confirmation for active Telegram pending action cards.
 * Accepts exact short phrases: "confirm", "send it", "cancel".
 * @param {string} rawTranscript
 * @returns {boolean} - true if matched and handled as a confirmation action
 */
function handleVoiceConfirmation(rawTranscript) {
  const pendingCards = document.querySelectorAll('.pending-action-card');
  if (pendingCards.length === 0) {
    return false;
  }

  const clean = rawTranscript.toLowerCase().trim().replace(/[.,!]/g, '');
  const isConfirm = clean === 'confirm' || clean === 'send it' || clean === 'send';
  const isCancel = clean === 'cancel' || clean === 'abort' || clean === 'cancel it';

  if (!isConfirm && !isCancel) {
    return false;
  }

  // Safety net: if multiple cards are pending, do not guess
  if (pendingCards.length > 1) {
    if (window.chat && window.chat.addMessage) {
      window.chat.addMessage('j', 'Multiple confirmations pending, sir. Please select the specific card directly.');
    }
    announceVoice('Multiple confirmations pending. Please select manually.');
    const inputEl = document.querySelector('#in');
    if (inputEl) inputEl.value = '';
    return true;
  }

  const card = pendingCards[0];
  if (isConfirm) {
    const confirmBtn = card.querySelector('button[data-confirm-action]');
    if (confirmBtn && !confirmBtn.disabled) {
      confirmBtn.click();
      announceVoice('Action confirmed via voice');
      const inputEl = document.querySelector('#in');
      if (inputEl) inputEl.value = '';
      return true;
    }
  } else if (isCancel) {
    const cancelBtn = card.querySelector('button[data-cancel-action]');
    if (cancelBtn && !cancelBtn.disabled) {
      cancelBtn.click();
      announceVoice('Action cancelled via voice');
      const inputEl = document.querySelector('#in');
      if (inputEl) inputEl.value = '';
      return true;
    }
  }

  return false;
}

/**
 * Reset hands-free 60-second silence timer.
 */
function resetSilenceTimer() {
  if (voiceState.silenceTimer) {
    clearTimeout(voiceState.silenceTimer);
    voiceState.silenceTimer = null;
  }

  if (voiceState.handsFree) {
    voiceState.silenceTimer = setTimeout(() => {
      console.log('[VOICE] 60 seconds silence elapsed. Disabling hands-free mode.');
      toggleHandsFree(false);
      if (window.chat && window.chat.addMessage) {
        window.chat.addMessage('j', 'Hands-free mode deactivated after 60 seconds of silence, sir.');
      }
      if (window.chat && window.chat.showToast) {
        window.chat.showToast('Hands-free mode deactivated (timeout)');
      }
      announceVoice('Hands-free mode deactivated after 60 seconds of silence.');
    }, 60000);
  }
}

/**
 * Initialize SpeechRecognition instance.
 */
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceState.isSupported = false;
    updateSupportUI(false);
    return;
  }

  voiceState.isSupported = true;
  updateSupportUI(true);

  const recognition = new SpeechRecognition();
  recognition.lang = SPEECH_LANG;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    voiceState.isListening = true;
    updateListeningUI(true);
    announceVoice('JARVIS listening');
    resetSilenceTimer();
  };

  recognition.onresult = (event) => {
    resetSilenceTimer();

    const inputEl = document.querySelector('#in');
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const item = event.results[i];
      if (item.isFinal) {
        finalTranscript += item[0].transcript;
      } else {
        interimTranscript += item[0].transcript;
      }
    }

    // Display interim results live in command input
    if (interimTranscript && inputEl) {
      inputEl.value = interimTranscript;
    }

    if (finalTranscript) {
      const rawText = finalTranscript.trim();

      // Check for voice confirmation first
      if (handleVoiceConfirmation(rawText)) {
        return;
      }

      // In hands-free mode, only act if the wake word "Jarvis" was spoken
      if (voiceState.handsFree) {
        const hasWakeWord = /^(hey\s+)?jarvis\b/i.test(rawText);
        if (!hasWakeWord) {
          console.log('[VOICE] Hands-free mode ignoring non-wake speech:', rawText);
          if (inputEl) inputEl.value = '';
          return;
        }
      }

      const cleaned = cleanTranscript(rawText);
      if (inputEl) {
        inputEl.value = cleaned;
      }

      if (!cleaned) return;

      if (voiceState.autoSend) {
        // Submit through the unified command submit function
        if (window.queue && window.queue.submit) {
          window.queue.submit(cleaned);
        } else if (window.submitCommand) {
          window.submitCommand(cleaned);
        }
      }
    }
  };

  recognition.onerror = (event) => {
    const errCode = event.error;
    console.warn('[VOICE] Speech recognition error:', errCode);

    let jarvisMessage = '';
    switch (errCode) {
      case 'not-allowed':
      case 'service-not-allowed':
        jarvisMessage = "Microphone access is blocked. Allow it in the browser's site settings.";
        break;
      case 'no-speech':
        // Suppress repeated toast/chat spam in continuous hands-free mode
        if (!voiceState.handsFree) {
          jarvisMessage = "I didn't hear anything, sir.";
        }
        break;
      case 'audio-capture':
        jarvisMessage = "No microphone was found.";
        break;
      case 'network':
        jarvisMessage = "Voice service is unreachable. Please type the command.";
        break;
      case 'aborted':
        // Normal stop/cancel, no error message needed
        break;
      default:
        jarvisMessage = "Voice recognition encountered an issue, sir.";
        break;
    }

    if (jarvisMessage && window.chat && window.chat.addMessage) {
      window.chat.addMessage('e', `⚠ ${jarvisMessage}`);
      announceVoice(jarvisMessage);
    }

    stopListening();
  };

  recognition.onend = () => {
    voiceState.isListening = false;
    updateListeningUI(false);

    // If hands-free is enabled and not speaking/hidden, resume listening automatically
    if (voiceState.handsFree && !voiceState.isSpeaking && !document.hidden) {
      setTimeout(() => {
        if (voiceState.handsFree && !voiceState.isListening && !voiceState.isSpeaking) {
          startListening();
        }
      }, 300);
    }
  };

  voiceState.recognition = recognition;
}

/**
 * Start speech recognition.
 */
function startListening() {
  if (!voiceState.isSupported || !voiceState.recognition) return;
  if (voiceState.isListening) return;

  // Stop any active text-to-speech so JARVIS never listens to itself
  stopSpeaking();

  try {
    voiceState.recognition.start();
  } catch (err) {
    console.warn('[VOICE] Could not start recognition:', err.message);
  }
}

/**
 * Stop speech recognition.
 */
function stopListening() {
  if (!voiceState.recognition) return;

  try {
    voiceState.recognition.stop();
  } catch (_) {}

  voiceState.isListening = false;
  updateListeningUI(false);
}

/**
 * Toggle speech recognition on/off.
 */
function toggleListening() {
  if (voiceState.isListening) {
    stopListening();
  } else {
    startListening();
  }
}

/**
 * Update UI state when listening begins or ends.
 * @param {boolean} isListening
 */
function updateListeningUI(isListening) {
  const micBtn = document.querySelector('#mic-btn');
  const inputEl = document.querySelector('#in');

  if (micBtn) {
    if (isListening) {
      micBtn.classList.add('listening');
      micBtn.setAttribute('aria-pressed', 'true');
      micBtn.setAttribute('aria-label', 'Stop voice input');
    } else {
      micBtn.classList.remove('listening');
      micBtn.setAttribute('aria-pressed', 'false');
      micBtn.setAttribute('aria-label', 'Start voice input');
    }
  }

  if (inputEl) {
    inputEl.placeholder = isListening ? 'Listening…' : 'Give JARVIS a command…';
  }

  if (window.chat && window.chat.setStatus) {
    if (isListening) {
      window.chat.setStatus('listening');
    } else {
      const qState = window.queue && window.queue.state;
      if (qState && qState.running) {
        window.chat.setStatus('processing');
      } else {
        window.chat.setStatus('online');
      }
    }
  }
}

/**
 * Update UI for supported vs unsupported browsers.
 * @param {boolean} supported
 */
function updateSupportUI(supported) {
  const micBtn = document.querySelector('#mic-btn');
  const unsupportedNote = document.querySelector('#voice-unsupported');

  if (micBtn) {
    micBtn.style.display = supported ? 'inline-flex' : 'none';
  }

  if (unsupportedNote) {
    unsupportedNote.style.display = supported ? 'none' : 'inline-block';
  }
}

/**
 * Select preferred English male voice (UK / British / Daniel / en-GB).
 */
function loadVoices() {
  if (!('speechSynthesis' in window)) return;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;

  // Prefer UK/British English male voice
  const preferred = voices.find(v => {
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();
    return (lang.startsWith('en') && (name.includes('daniel') || name.includes('uk') || name.includes('british') || lang.includes('en-gb')));
  });

  // Fallback to any English voice
  const englishFallback = voices.find(v => v.lang.toLowerCase().startsWith('en'));

  voiceState.selectedVoice = preferred || englishFallback || voices[0];
}

/**
 * Extract up to the first two sentences for spoken reply.
 * Filters out raw markdown formatting and step lists.
 * @param {string} fullText
 * @returns {string}
 */
function getSpokenSummary(fullText) {
  if (!fullText) return '';

  // Clean markdown tokens
  let text = fullText
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^>\s*/gm, '')
    .trim();

  // Split into sentences (by period, question mark, or exclamation mark)
  const sentenceMatches = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  if (sentenceMatches && sentenceMatches.length > 2) {
    return (sentenceMatches[0] + ' ' + sentenceMatches[1]).trim();
  }

  return text;
}

/**
 * Speak final JARVIS reply if speaker mode is enabled.
 * Stops speech recognition while speaking to prevent feedback loops.
 * @param {string} replyText
 */
function speakReply(replyText) {
  if (!voiceState.speakerEnabled) return;
  if (!('speechSynthesis' in window)) return;
  if (!replyText) return;

  // Stop recognition while JARVIS speaks so it doesn't hear itself
  stopListening();
  stopSpeaking();

  const spokenContent = getSpokenSummary(replyText);
  if (!spokenContent) return;

  const utterance = new SpeechSynthesisUtterance(spokenContent);
  if (voiceState.selectedVoice) {
    utterance.voice = voiceState.selectedVoice;
  }
  utterance.rate = 1.0;
  utterance.pitch = 0.9;

  voiceState.isSpeaking = true;

  utterance.onend = () => {
    voiceState.isSpeaking = false;
    // Resume listening if in hands-free mode and not hidden
    if (voiceState.handsFree && !document.hidden && !voiceState.isListening) {
      setTimeout(() => {
        if (voiceState.handsFree && !voiceState.isSpeaking) {
          startListening();
        }
      }, 250);
    }
  };

  utterance.onerror = (e) => {
    console.warn('[VOICE] SpeechSynthesis error:', e.error);
    voiceState.isSpeaking = false;
    if (voiceState.handsFree && !document.hidden && !voiceState.isListening) {
      startListening();
    }
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Cancel any ongoing speech synthesis.
 */
function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  voiceState.isSpeaking = false;
}

/**
 * Toggle spoken replies (TTS).
 * @param {boolean} [forcedState]
 */
function toggleSpeaker(forcedState = null) {
  voiceState.speakerEnabled = forcedState !== null ? forcedState : !voiceState.speakerEnabled;
  if (!voiceState.speakerEnabled) {
    stopSpeaking();
  }

  const btn = document.querySelector('#tts-btn');
  const statusEl = document.querySelector('#tts-status');
  if (btn) {
    btn.setAttribute('aria-pressed', voiceState.speakerEnabled ? 'true' : 'false');
  }
  if (statusEl) {
    statusEl.textContent = voiceState.speakerEnabled ? 'ON' : 'OFF';
  }

  announceVoice(`Spoken replies turned ${voiceState.speakerEnabled ? 'on' : 'off'}`);
}

/**
 * Toggle Hands-Free mode.
 * @param {boolean} [forcedState]
 */
function toggleHandsFree(forcedState = null) {
  voiceState.handsFree = forcedState !== null ? forcedState : !voiceState.handsFree;

  const btn = document.querySelector('#hands-free-btn');
  const statusEl = document.querySelector('#hands-free-status');
  const indicator = document.querySelector('#hands-free-indicator');

  if (btn) {
    btn.setAttribute('aria-pressed', voiceState.handsFree ? 'true' : 'false');
  }
  if (statusEl) {
    statusEl.textContent = voiceState.handsFree ? 'ON' : 'OFF';
  }
  if (indicator) {
    indicator.style.display = voiceState.handsFree ? 'inline-flex' : 'none';
  }

  if (voiceState.handsFree) {
    resetSilenceTimer();
    startListening();
    announceVoice('Hands-free mode active. Say "Jarvis" before commands.');
  } else {
    if (voiceState.silenceTimer) {
      clearTimeout(voiceState.silenceTimer);
      voiceState.silenceTimer = null;
    }
    stopListening();
    announceVoice('Hands-free mode deactivated.');
  }
}

/**
 * Bind DOM interactions and event listeners on page load.
 */
document.addEventListener('DOMContentLoaded', () => {
  initSpeechRecognition();

  if ('speechSynthesis' in window) {
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // Mic button click
  const micBtn = document.querySelector('#mic-btn');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      toggleListening();
    });
  }

  // Keyboard shortcut: Ctrl+M (or Cmd+M)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      toggleListening();
    }
  });

  // Speaker toggle button
  const ttsBtn = document.querySelector('#tts-btn');
  if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
      toggleSpeaker();
    });
  }

  // Auto-send checkbox toggle
  const autoSendToggle = document.querySelector('#auto-send-toggle');
  if (autoSendToggle) {
    autoSendToggle.addEventListener('change', (e) => {
      voiceState.autoSend = e.target.checked;
      announceVoice(`Auto-send voice commands ${voiceState.autoSend ? 'enabled' : 'disabled'}`);
    });
  }

  // Hands-free toggle button
  const hfBtn = document.querySelector('#hands-free-btn');
  if (hfBtn) {
    hfBtn.addEventListener('click', () => {
      toggleHandsFree();
    });
  }

  // Tab visibility change: abort listening/speaking and turn off hands-free when hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopListening();
      stopSpeaking();
      if (voiceState.handsFree) {
        toggleHandsFree(false);
      }
    }
  });
});

window.voice = {
  state: voiceState,
  startListening,
  stopListening,
  toggleListening,
  speakReply,
  stopSpeaking,
  toggleSpeaker,
  toggleHandsFree,
  cleanTranscript
};
