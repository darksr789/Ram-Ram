// === linkgc.js ===
module.exports = {
    pattern: "linkgc",
    desc: "Get the group's invite link (Admin/Owner Only)",
    category: "group",
    react: "🔗",
    filename: __filename,
    use: ".linkgc",

    execute: async (conn, message, m, { from, isGroup, isAdmins, isOwner, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isAdmins && !isOwner) return reply("❌ Only admins can use this command.");

            const code = await conn.groupInviteCode(from);
            const link = `https://chat.whatsapp.com/${code}`;

            reply(`🔗 *Group Invite Link:*\n${link}`);

        } catch (e) {
            console.error("Linkgc error:", e);
            reply("⚠️ Failed to fetch group invite link. Make sure the bot is an admin.");
        }
    }
};
