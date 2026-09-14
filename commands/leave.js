// === leave.js ===
module.exports = {
    pattern: "leave",
    desc: "Make the bot leave the current group (Owner Only)",
    category: "group",
    react: "🚪",
    filename: __filename,
    use: ".leave",

    execute: async (conn, message, m, { from, isGroup, isOwner, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isOwner) return reply("❌ Owner only!");

            await conn.sendMessage(from, { text: "👋 Goodbye! The bot is leaving this group." });
            await conn.groupLeave(from);

        } catch (e) {
            console.error("Leave error:", e);
            reply("⚠️ Failed to leave the group.");
        }
    }
};
