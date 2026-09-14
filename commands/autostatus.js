// === autostatus.js ===
// .autoviewstatus on/off — toggles whether the bot auto-marks contacts' statuses as seen
// .autolikestatus on/off — toggles whether the bot auto-reacts to contacts' statuses
// Both are global, owner-only settings.

const { getSetting, setSetting } = require('../Settings.js');

module.exports = {
    autoviewstatus: {
        pattern: "autoviewstatus",
        desc: "Toggle auto-viewing (marking as seen) of contacts' statuses",
        category: "owner",
        react: "👀",
        filename: __filename,
        use: ".autoviewstatus on/off",

        execute: async (conn, message, m, { isOwner, reply, args }) => {
            try {
                if (!isOwner) return reply("❌ Owner only!");

                const state = (args[0] || "").toLowerCase();

                if (state === "on") {
                    setSetting("global", "autoviewstatus", true);
                    return reply("👀 Auto-view status *enabled*.");
                }
                if (state === "off") {
                    setSetting("global", "autoviewstatus", false);
                    return reply("🚫 Auto-view status *disabled*.");
                }

                const current = getSetting("global", "autoviewstatus") ? "ON ✅" : "OFF ❌";
                return reply(`📌 *Usage:* .autoviewstatus on/off\n\nCurrent status: *${current}*`);

            } catch (error) {
                console.error("Autoviewstatus error:", error);
                reply("⚠️ Failed to toggle auto-view status.");
            }
        }
    },

    autolikestatus: {
        pattern: "autolikestatus",
        desc: "Toggle auto-reacting to contacts' statuses",
        category: "owner",
        react: "❤️",
        filename: __filename,
        use: ".autolikestatus on/off",

        execute: async (conn, message, m, { isOwner, reply, args }) => {
            try {
                if (!isOwner) return reply("❌ Owner only!");

                const state = (args[0] || "").toLowerCase();

                if (state === "on") {
                    setSetting("global", "autolikestatus", true);
                    return reply("❤️ Auto-like status *enabled*.");
                }
                if (state === "off") {
                    setSetting("global", "autolikestatus", false);
                    return reply("🚫 Auto-like status *disabled*.");
                }

                const current = getSetting("global", "autolikestatus") ? "ON ✅" : "OFF ❌";
                return reply(`📌 *Usage:* .autolikestatus on/off\n\nCurrent status: *${current}*`);

            } catch (error) {
                console.error("Autolikestatus error:", error);
                reply("⚠️ Failed to toggle auto-like status.");
            }
        }
    }
};
