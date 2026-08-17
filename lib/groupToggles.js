// === lib/groupToggles.js ===
// Shared per-group welcome/goodbye toggle storage. Both the .welcome/.goodbye
// commands AND the actual join/leave event handler (events/GroupEvents.js)
// read and write through this SAME module, so they can never drift apart
// again (previously the command wrote to process.env while the event
// handler read from a JSON file that nothing ever wrote to).

const fs = require('fs');
const path = require('path');

const SETTINGS_DIR = path.join(__dirname, '..', 'database');
const WELCOME_FILE = path.join(SETTINGS_DIR, 'welcome.json');
const GOODBYE_FILE = path.join(SETTINGS_DIR, 'goodbye.json');

function ensureDir() {
    if (!fs.existsSync(SETTINGS_DIR)) {
        fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }
}

function loadSettings(file) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (e) {
        console.error('groupToggles: failed to read', file, e.message);
    }
    return {};
}

function saveSettings(file, settings) {
    try {
        ensureDir();
        fs.writeFileSync(file, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('groupToggles: failed to write', file, e.message);
    }
}

function isWelcomeEnabled(groupId) {
    return loadSettings(WELCOME_FILE)[groupId] === true;
}

function setWelcome(groupId, enabled) {
    const settings = loadSettings(WELCOME_FILE);
    settings[groupId] = !!enabled;
    saveSettings(WELCOME_FILE, settings);
}

function isGoodbyeEnabled(groupId) {
    return loadSettings(GOODBYE_FILE)[groupId] === true;
}

function setGoodbye(groupId, enabled) {
    const settings = loadSettings(GOODBYE_FILE);
    settings[groupId] = !!enabled;
    saveSettings(GOODBYE_FILE, settings);
}

module.exports = {
    WELCOME_FILE,
    GOODBYE_FILE,
    isWelcomeEnabled,
    setWelcome,
    isGoodbyeEnabled,
    setGoodbye
};
