// === Settings.js ===
// Simple JSON-file-backed per-group settings store.
// Used by the antilink command (and available for other group settings later).

const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "group-settings.json");

function loadAll() {
  try {
    if (!fs.existsSync(FILE_PATH)) return {};
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Settings.js: failed to read group-settings.json:", e.message);
    return {};
  }
}

function saveAll(data) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Settings.js: failed to write group-settings.json:", e.message);
  }
}

/**
 * Get a setting value for a group.
 * @param {string} groupId
 * @param {string} key
 * @returns {*} value or undefined
 */
function getSetting(groupId, key) {
  const all = loadAll();
  return all[groupId] ? all[groupId][key] : undefined;
}

/**
 * Set a setting value for a group.
 * @param {string} groupId
 * @param {string} key
 * @param {*} value
 */
function setSetting(groupId, key, value) {
  const all = loadAll();
  if (!all[groupId]) all[groupId] = {};
  all[groupId][key] = value;
  saveAll(all);
}

/**
 * Increment the link-warning count for a user in a group.
 * Returns the new count.
 */
function incrementWarn(groupId, userId) {
  const all = loadAll();
  if (!all[groupId]) all[groupId] = {};
  if (!all[groupId].warnCounts) all[groupId].warnCounts = {};
  const current = all[groupId].warnCounts[userId] || 0;
  const next = current + 1;
  all[groupId].warnCounts[userId] = next;
  saveAll(all);
  return next;
}

/**
 * Reset the link-warning count for a user in a group.
 */
function resetWarn(groupId, userId) {
  const all = loadAll();
  if (all[groupId] && all[groupId].warnCounts) {
    delete all[groupId].warnCounts[userId];
    saveAll(all);
  }
}

module.exports = { getSetting, setSetting, incrementWarn, resetWarn };
