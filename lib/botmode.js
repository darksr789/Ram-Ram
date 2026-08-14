// === lib/botmode.js ===
// Per-session (per linked number) public/private mode storage.
// Each user who pairs their WhatsApp number to this panel gets an
// independent mode, saved to disk so it survives restarts.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'database', 'botmode');

function ensureDir() {
    if (!fs.existsSync(DIR)) {
        fs.mkdirSync(DIR, { recursive: true });
    }
}

function filePath(sessionId) {
    const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(DIR, `${safe}.txt`);
}

// Returns 'public' or 'private'. Defaults to 'public' if never set.
function getMode(sessionId) {
    try {
        const fp = filePath(sessionId);
        if (!fs.existsSync(fp)) return 'public';
        const raw = fs.readFileSync(fp, 'utf-8').trim();
        return raw === 'private' ? 'private' : 'public';
    } catch (e) {
        console.error('botmode: failed to read mode:', e.message);
        return 'public';
    }
}

function setMode(sessionId, mode) {
    try {
        ensureDir();
        fs.writeFileSync(filePath(sessionId), mode === 'private' ? 'private' : 'public');
    } catch (e) {
        console.error('botmode: failed to save mode:', e.message);
    }
}

module.exports = { getMode, setMode };
