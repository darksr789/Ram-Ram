// === antigcstatus.js ===
// .antigcstatus on/off — auto-kicks anyone who types a "gcstatus"-style command
// (used by OTHER bots to post this group's invite link to their WhatsApp status).
//
// .antigroupmention on/off — auto-kicks anyone who mentions/tags this group in
// their own WhatsApp status (a common way group invite links leak publicly).
// NOTE: this depends on WhatsApp/Baileys exposing "groupMentions" on status
// updates, and only works for statuses the bot's number actually receives
// (i.e. posted by a saved contact). It's best-effort, not guaranteed 100%.

const { getSetting, setSetting } = require('../Settings.js');

module.exports = {
    antigcstatus: {
        pattern: "antigcstatus",
        desc: "Auto-kick members who try to trigger a gcstatus command in this group",
        category: "group",
        react: "🛡️",
        filename: __filename,
        use: ".antigcstatus on/off",

        execute: async (conn, message, m, { from, isGroup, isAdmins, isOwner, reply, args }) => {
            try {
                if (!isGroup) return reply("❌ Group only!");
                if (!isAdmins && !isOwner) return reply("❌ Admin only!");

                const state = (args[0] || "").toLowerCase();

                if (state === "on") {
                    setSetting(from, "antigcstatus", true);
                    return reply("🛡️ Anti-gcstatus *enabled*.\n\nAnyone who types a gcstatus-style command in this group will be instantly kicked.");
                }

                if (state === "off") {
                    setSetting(from, "antigcstatus", false);
                    return reply("🚫 Anti-gcstatus *disabled*.");
                }

                const current = getSetting(from, "antigcstatus") ? "ON ✅" : "OFF ❌";
                return reply(`📌 *Usage:* .antigcstatus on/off\n\nCurrent status: *${current}*`);

            } catch (error) {
                console.error("Antigcstatus command error:", error);
                reply("⚠️ Failed to toggle anti-gcstatus.");
            }
        }
    },

    antigroupmention: {
        pattern: "antigroupmention",
        desc: "Auto-kick members who mention this group in their WhatsApp status",
        category: "group",
        react: "🛡️",
        filename: __filename,
        use: ".antigroupmention on/off",

        execute: async (conn, message, m, { from, isGroup, isAdmins, isOwner, reply, args }) => {
            try {
                if (!isGroup) return reply("❌ Group only!");
                if (!isAdmins && !isOwner) return reply("❌ Admin only!");

                const state = (args[0] || "").toLowerCase();

                if (state === "on") {
                    setSetting(from, "antigroupmention", true);
                    return reply("🛡️ Anti-groupmention *enabled*.\n\n⚠️ Note: this only catches statuses the bot's number can actually see (posted by a saved contact).\n\nAnyone who tags this group in their status will be kicked.");
                }

                if (state === "off") {
                    setSetting(from, "antigroupmention", false);
                    return reply("🚫 Anti-groupmention *disabled*.");
                }

                const current = getSetting(from, "antigroupmention") ? "ON ✅" : "OFF ❌";
                return reply(`📌 *Usage:* .antigroupmention on/off\n\nCurrent status: *${current}*`);

            } catch (error) {
                console.error("Antigroupmention command error:", error);
                reply("⚠️ Failed to toggle anti-groupmention.");
            }
        }
    }
};
