/**
 * api.js - Lightweight fetch client helper
 * Handles requests and broadcasts auth-expired on HTTP 401 responses.
 */
const api = {
  async request(url, options = {}) {
    const defaultHeaders = {
      'Accept': 'application/json'
    };

    const config = {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(url, config);

      // Dispatch global auth-expired event if unauthorized
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth-expired', {
          detail: { url, status: 401 }
        }));
      }

      if (!response.ok) {
        let errData = null;
        try {
          errData = await response.json();
        } catch (_) {}
        const error = new Error((errData && errData.error) || `HTTP error ${response.status}`);
        error.status = response.status;
        error.data = errData;
        throw error;
      }

      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (err) {
      // Re-throw so callers can handle specific errors
      throw err;
    }
  },

  get(url) {
    return this.request(url, { method: 'GET' });
  },

  post(url, body) {
    return this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }
};

window.api = api;
