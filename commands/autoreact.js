// === autoreact.js ===
// .autoreact on/off — when enabled, the bot reacts to every normal message
// (DMs and groups) with a random emoji. This is a global, owner-only setting.

const { getSetting, setSetting } = require('../Settings.js');

module.exports = {
    pattern: "autoreact",
    desc: "Toggle automatic random-emoji reactions on every incoming message",
    category: "owner",
    react: "🎲",
    filename: __filename,
    use: ".autoreact on/off",

    execute: async (conn, message, m, { isOwner, reply, args }) => {
        try {
            if (!isOwner) return reply("❌ Owner only!");

            const state = (args[0] || "").toLowerCase();

            if (state === "on") {
                setSetting("global", "autoreact", true);
                return reply("🎲 Autoreact *enabled*.\n\nThe bot will now react to every message with a random emoji.");
            }

            if (state === "off") {
                setSetting("global", "autoreact", false);
                return reply("🚫 Autoreact *disabled*.");
            }

            const current = getSetting("global", "autoreact") ? "ON ✅" : "OFF ❌";
            return reply(`📌 *Usage:* .autoreact on/off\n\nCurrent status: *${current}*`);

        } catch (error) {
            console.error("Autoreact command error:", error);
            reply("⚠️ Failed to toggle autoreact.");
        }
    }
};
