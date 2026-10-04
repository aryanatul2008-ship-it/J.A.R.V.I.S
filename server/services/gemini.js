/**
 * gemini.js - J.A.R.V.I.S Assistant Brain & Agent Loop
 * Powered by Google Gemini API with multi-step tool execution.
 */

const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const tools = require('./tools');

let aiClient = null;

function getAiClient() {
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return aiClient;
}

/**
 * Build the system prompt tailored to the user's current time and timezone.
 * @param {object} params
 * @param {string} [params.timezone='UTC']
 * @param {string} [params.nowISO]
 * @returns {string}
 */
function buildSystemPrompt({ timezone = 'UTC', nowISO = new Date().toISOString() }) {
  return `You are JARVIS, Tony Stark's personal AI assistant. Be concise, polite and slightly witty; address the user as 'sir' occasionally. Current date and time: ${nowISO}. The user's timezone: ${timezone}. Resolve relative dates and times ('tomorrow at 5 PM', '30 minutes before it') into exact ISO 8601 values with offset. Use the provided tools to act; never claim an action was done unless the tool result says so. If a required detail is missing or ambiguous (time, recipient, message text), do NOT guess and do NOT call the tool: ask one short clarifying question. Never invent contacts or file names. For requests with several parts, call the tools in the right order, using earlier results (for example an event's start time) in later calls. Messages are never sent directly: send_telegram_message prepares them and the user confirms. After acting, reply with a short summary of what was done and what is waiting for confirmation.`;
}

/**
 * Call Gemini with automatic fallback on temporary spikes / 503 unavailability.
 * @param {object} params
 */
async function callGemini(params) {
  const ai = getAiClient();
  const primaryModel = config.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbackModel = config.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

  try {
    return await ai.models.generateContent({
      model: primaryModel,
      contents: params.contents,
      config: params.config
    });
  } catch (primaryErr) {
    const isTemporary = primaryErr.status === 503 ||
                        primaryErr.status === 429 ||
                        (primaryErr.message && primaryErr.message.toLowerCase().includes('demand'));

    if (isTemporary && fallbackModel !== primaryModel) {
      console.warn(`[GEMINI] Primary model ${primaryModel} busy (${primaryErr.message}). Retrying with fallback ${fallbackModel}...`);
      return await ai.models.generateContent({
        model: fallbackModel,
        contents: params.contents,
        config: params.config
      });
    }

    throw primaryErr;
  }
}

/**
 * Run multi-step agent loop for user command.
 * @param {object} options
 * @param {number} options.userId
 * @param {string} options.text
 * @param {Array} [options.history=[]]
 * @param {string} [options.timezone='UTC']
 * @param {string} [options.nowISO]
 * @param {Function} options.emit
 * @param {AbortSignal} [options.signal]
 */
async function runAgent({ userId, text, history = [], timezone = 'UTC', nowISO, emit, signal }) {
  const currentNowISO = nowISO || new Date().toISOString();
  const systemInstruction = buildSystemPrompt({ timezone, nowISO: currentNowISO });

  // 1. Build initial contents from last 10 history items plus new user prompt
  const contents = [];
  const recentHistory = Array.isArray(history) ? history.slice(-10) : [];

  for (const item of recentHistory) {
    const role = (item.role === 'model' || item.sender === 'j' || item.sender === 'model') ? 'model' : 'user';
    const itemText = item.text || item.content || '';
    if (itemText && typeof itemText === 'string') {
      contents.push({
        role,
        parts: [{ text: itemText }]
      });
    }
  }

  // Append new user message
  contents.push({
    role: 'user',
    parts: [{ text: text.trim() }]
  });

  const toolsConfig = [{
    functionDeclarations: tools.functionDeclarations
  }];

  // 2. Loop up to 6 times for multi-step reasoning
  for (let iteration = 0; iteration < 6; iteration++) {
    if (signal && signal.aborted) {
      return;
    }

    let response;
    try {
      response = await callGemini({
        contents,
        config: {
          systemInstruction,
          tools: toolsConfig
        }
      });
    } catch (geminiErr) {
      console.error('[GEMINI] Reasoning core error:', geminiErr.message);
      emit({
        type: 'error',
        code: 'ai_unavailable',
        message: 'JARVIS reasoning core is unreachable. Try again shortly.'
      });
      return;
    }

    if (signal && signal.aborted) {
      return;
    }

    const functionCalls = response.functionCalls || [];

    // If no function calls returned, emit final assistant message and complete
    if (functionCalls.length === 0) {
      const replyText = response.text || 'I have completed your request, sir.';
      emit({
        type: 'message',
        text: replyText
      });
      return;
    }

    // Append the model's function-call content to history
    const modelContent = (response.candidates && response.candidates[0] && response.candidates[0].content)
      ? response.candidates[0].content
      : {
          role: 'model',
          parts: functionCalls.map((fc) => ({ functionCall: fc }))
        };
    contents.push(modelContent);

    const functionResponseParts = [];

    // Execute each function call IN ORDER
    for (let i = 0; i < functionCalls.length; i++) {
      if (signal && signal.aborted) {
        return;
      }

      const call = functionCalls[i];
      const toolName = call.name;
      const toolArgs = call.args || {};
      const stepId = call.id || `step_${iteration + 1}_${i + 1}`;
      const summary = tools.getToolSummary(toolName, toolArgs);

      // 1. Emit running step
      emit({
        type: 'step',
        id: stepId,
        tool: toolName,
        status: 'running',
        summary
      });

      try {
        // Execute tool
        const result = await tools.executeTool(userId, toolName, toolArgs);

        // 2. Emit done step
        emit({
          type: 'step',
          id: stepId,
          tool: toolName,
          status: 'done',
          summary,
          result
        });

        // Write action_log row for executed tools
        if (toolName !== 'send_telegram_message') {
          await tools.logAction(userId, toolName, summary, 'success');
        }

        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: toolName,
            response: (typeof result === 'object' && result !== null ? result : { result })
          }
        });
      } catch (err) {
        console.warn(`[GEMINI] Tool "${toolName}" failed:`, err.message);

        const errCode = err.code || 'execution_error';
        const errMsg = err.message || 'Tool execution failed';

        // 2. Emit error step
        emit({
          type: 'step',
          id: stepId,
          tool: toolName,
          status: 'error',
          summary,
          code: errCode,
          message: errMsg
        });

        // Write action_log row
        await tools.logAction(userId, toolName, summary, 'failed', errMsg);

        // If the executor throws 'clarification_needed' or 'validation',
        // pass that message back to the model as the function response so it asks the user a natural question.
        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: toolName,
            response: {
              error: errMsg,
              code: errCode
            }
          }
        });
      }
    }

    // Append tool responses as user content for the next turn
    contents.push({
      role: 'user',
      parts: functionResponseParts
    });
  }

  // Fallback reply if loop exhausted 6 steps without final text
  emit({
    type: 'message',
    text: 'All requested operations have been processed, sir.'
  });
}

module.exports = {
  buildSystemPrompt,
  callGemini,
  runAgent
};
