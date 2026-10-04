/**
 * crypto.js - AES-256-GCM cryptographic helper for encrypting tokens at rest
 */

const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM

/**
 * Derive a 32-byte key buffer from configuration.
 */
function getKey() {
  const rawKey = config.TOKEN_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is missing from configuration');
  }

  const buf = Buffer.from(rawKey, 'utf8');
  if (buf.length === 32) {
    return buf;
  }

  // Derive fixed 32-byte key if provided key differs in byte length
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypt plaintext string using AES-256-GCM.
 * @param {string} text
 * @returns {string} iv:authTag:ciphertext in hex
 */
function encrypt(text) {
  if (text === null || text === undefined) return null;

  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(String(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (err) {
    throw new Error(`Token encryption failed: ${err.message}`);
  }
}

/**
 * Decrypt an AES-256-GCM ciphertext payload.
 * @param {string} encryptedString - iv:authTag:ciphertext in hex
 * @returns {string} Plaintext string
 */
function decrypt(encryptedString) {
  if (encryptedString === null || encryptedString === undefined) return null;

  try {
    const parts = String(encryptedString).split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted token format');
    }

    const [ivHex, authTagHex, cipherText] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    throw new Error(`Token decryption failed: ${err.message}`);
  }
}

module.exports = {
  encrypt,
  decrypt
};
