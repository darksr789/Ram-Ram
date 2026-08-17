// === lib/autoPresence.js ===
// Per-session (per paired number) auto-typing / auto-recording presence
// setting. Previously this only lived in a shared process.env variable,
// which had two problems: (1) no chat command could change it at all —
// only editing .env on the host worked, and (2) even if it were changed,
// it would affect every user's bot on this server at once.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'database', 'autopresence');

function ensureDir() {
    if (!fs.existsSync(DIR)) {
        fs.mkdirSync(DIR, { recursive: true });
    }
}

function filePath(sessionId) {
    const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(DIR, `${safe}.txt`);
}

// Returns 'typing', 'recording', or 'off'. Defaults to 'off'.
function getPresenceMode(sessionId) {
    try {
        const fp = filePath(sessionId);
        if (!fs.existsSync(fp)) return 'off';
        const raw = fs.readFileSync(fp, 'utf-8').trim();
        return ['typing', 'recording', 'off'].includes(raw) ? raw : 'off';
    } catch (e) {
        console.error('autoPresence: failed to read mode:', e.message);
        return 'off';
    }
}

function setPresenceMode(sessionId, mode) {
    try {
        ensureDir();
        const safeMode = ['typing', 'recording', 'off'].includes(mode) ? mode : 'off';
        fs.writeFileSync(filePath(sessionId), safeMode);
    } catch (e) {
        console.error('autoPresence: failed to save mode:', e.message);
    }
}

module.exports = { getPresenceMode, setPresenceMode };
