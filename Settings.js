// === Settings.js ===
// Simple JSON-file-backed per-group settings store with in-memory caching.

const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "group-settings.json");

let cache = null; // In-memory cache for fast access

function loadAll() {
  if (cache !== null) return cache;
  try {
    if (!fs.existsSync(FILE_PATH)) {
      cache = {};
      return cache;
    }
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    cache = raw ? JSON.parse(raw) : {};
    return cache;
  } catch (e) {
    console.error("Settings.js: failed to read group-settings.json:", e.message);
    return cache || {};
  }
}

function saveAll(data) {
  cache = data; // Update cache
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Settings.js: failed to write group-settings.json:", e.message);
  }
}

/**
 * Get a setting value for a group.
 */
function getSetting(groupId, key) {
  const all = loadAll();
  return all[groupId] ? all[groupId][key] : undefined;
}

/**
 * Set a setting value for a group.
 */
function setSetting(groupId, key, value) {
  const all = loadAll();
  if (!all[groupId]) all[groupId] = {};
  all[groupId][key] = value;
  saveAll(all);
}

/**
 * Increment the link-warning count for a user in a group.
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
