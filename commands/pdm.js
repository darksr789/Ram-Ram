// === pdm.js ===
// .pdm on/off — when enabled for a group, the bot announces whenever an admin
// promotes or demotes a member, mentioning both who did it and who it was
// done to. Handled together with welcome/goodbye in events/GroupEvents.js.

const { getSetting, setSetting } = require('../Settings.js');

module.exports = {
    pattern: "pdm",
    desc: "Toggle promote/demote announcements in this group",
    category: "group",
    react: "🛡️",
    filename: __filename,
    use: ".pdm on/off",

    execute: async (conn, message, m, { from, isGroup, isAdmins, isOwner, reply, args }) => {
        try {
            if (!isGroup) return reply("❌ Group only!");
            if (!isAdmins && !isOwner) return reply("❌ Admin only!");

            const state = (args[0] || "").toLowerCase();

            if (state === "on") {
                setSetting(from, "pdm", true);
                return reply("🛡️ PDM *enabled*.\n\nThe bot will now announce whenever someone is promoted or demoted, and who did it.");
            }

            if (state === "off") {
                setSetting(from, "pdm", false);
                return reply("🚫 PDM *disabled*.");
            }

            const current = getSetting(from, "pdm") ? "ON ✅" : "OFF ❌";
            return reply(`📌 *Usage:* .pdm on/off\n\nCurrent status: *${current}*`);

        } catch (error) {
            console.error("PDM command error:", error);
            reply("⚠️ Failed to toggle PDM.");
        }
    }
};
