'use strict'

const ms = require('ms')

const DEFAULT_MAX_AGE = '7d'
const ALLOWED_DURATIONS = new Set(['1h', '12h', '1d', '7d', '30d'])

/**
 * Convert an allow-listed duration string into milliseconds.
 * Uses an allow-list to reject unexpected input safely.
 */
function parseDurationMs (durationInput = DEFAULT_MAX_AGE) {
  if (typeof durationInput !== 'string') {
    throw new TypeError('Duration must be a string')
  }

  const normalized = durationInput.trim().toLowerCase()
  if (!ALLOWED_DURATIONS.has(normalized)) {
    throw new RangeError(`Unsupported duration: ${normalized}`)
  }

  return ms(normalized)
}

function buildSessionConfig (role, durationInput) {
  const validRoles = ['viewer', 'editor', 'admin']
  if (!validRoles.includes(role)) {
    throw new Error('Invalid role provided')
  }

  const ttlMs = parseDurationMs(durationInput)
  return {
    role,
    ttlMs,
    expiresAt: new Date(Date.now() + ttlMs).toISOString()
  }
}

if (require.main === module) {
  const sampleConfig = buildSessionConfig('viewer', '1d')
  console.log('Session config initialized:', JSON.stringify(sampleConfig))
}

module.exports = {
  parseDurationMs,
  buildSessionConfig
}