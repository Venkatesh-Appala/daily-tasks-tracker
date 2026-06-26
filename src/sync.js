// Cross-device sync via JSONBin.
//
// Stores a single JSON document holding child details and their task-completion
// progress, so the portal can be opened from any device and show the same data.
//
// Credentials come from Vite env vars (VITE_JSONBIN_*) so the access key is not
// committed to the repo. See .env.example for the variable names. If the vars are
// missing the app silently falls back to localStorage-only (no cross-device sync).

const BIN_ID = import.meta.env.VITE_JSONBIN_BIN_ID
const ACCESS_KEY = import.meta.env.VITE_JSONBIN_ACCESS_KEY

export const SYNC_ENABLED = Boolean(BIN_ID && ACCESS_KEY)

const BASE = `https://api.jsonbin.io/v3/b/${BIN_ID}`

// Read the latest document. Returns the stored record object, or null when sync
// is disabled. Throws on a network/HTTP error so callers can avoid clobbering
// cloud data they failed to read.
export async function fetchCloud() {
  if (!SYNC_ENABLED) return null
  const res = await fetch(`${BASE}/latest`, {
    headers: { 'X-Access-Key': ACCESS_KEY },
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(`JSONBin read failed: HTTP ${res.status}`)
  const json = await res.json()
  return json.record
}

// Overwrite the document with `record`. No-op when sync is disabled.
export async function pushCloud(record) {
  if (!SYNC_ENABLED) return
  const res = await fetch(BASE, {
    method: 'PUT',
    headers: { 'X-Access-Key': ACCESS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  })
  if (!res.ok) throw new Error(`JSONBin write failed: HTTP ${res.status}`)
}
