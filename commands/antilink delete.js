// === antilink.js ===
// Replaces the old "antilink delete.js" / "antilink kick.js" / "antilink warn.js" files.
// Those never worked because the bot only reads the FIRST word after the prefix as the
// command name (e.g. ".antilink delete on" -> commandName = "antilink"), so a pattern
// containing a space like "antilink delete" could never match anything.
// This single command uses pattern "antilink" and reads the mode from args[0] instead.

const { getSetting, setSetting } = require('../Settings.js');

module.exports = {
    pattern: "antilink",
    desc: "Control link auto-moderation in this group (Admin only)",
    category: "group",
    react: "🛡️",
    filename: __filename,
    use: ".antilink delete/kick/warn on | .antilink off",

    execute: async (conn, message, m, { from, isGroup, isAdmins, isCreator, reply, args }) => {
        try {
            if (!isGroup) return reply("❌ Group only!");
            if (!isAdmins && !isCreator) return reply("❌ Admin only!");

            const mode = (args[0] || "").toLowerCase();
            const state = (args[1] || "").toLowerCase();

            if (mode === "off") {
                setSetting(from, "antilink", false);
                return reply("🚫 Anti-link disabled for this group.");
            }

            if (!["delete", "kick", "warn"].includes(mode)) {
                return reply(
                    "📌 *Usage:*\n" +
                    ".antilink delete on/off\n" +
                    ".antilink kick on/off\n" +
                    ".antilink warn on/off\n" +
                    ".antilink off"
                );
            }

            if (state === "off") {
                setSetting(from, "antilink", false);
                return reply("🚫 Anti-link disabled for this group.");
            }

            if (state !== "on") {
                return reply(`📌 Usage: .antilink ${mode} on/off`);
            }

            setSetting(from, "antilink", mode);

            const modeText = {
                delete: "🛡️ Anti-link enabled in *DELETE MODE*\n\n⚠️ Links will be deleted only.",
                kick: "🛡️ Anti-link enabled in *KICK MODE*\n\n⚠️ Users who post links will be instantly kicked.",
                warn: "🛡️ Anti-link enabled in *WARN MODE*\n\n⚠️ Users will be kicked after 3 warnings.",
            };

            return reply(modeText[mode]);

        } catch (error) {
            console.error("Antilink error:", error);
            reply("⚠️ Failed to toggle anti-link.");
        }
    }
};
