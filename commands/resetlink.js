// === resetlink.js ===
module.exports = {
    pattern: "resetlink",
    desc: "Revoke the old invite link and generate a new one (Admin/Owner Only)",
    category: "group",
    react: "🔄",
    filename: __filename,
    use: ".resetlink",

    execute: async (conn, message, m, { from, isGroup, isAdmins, isOwner, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isAdmins && !isOwner) return reply("❌ Only admins can use this command.");

            const newCode = await conn.groupRevokeInvite(from);
            const link = `https://chat.whatsapp.com/${newCode}`;

            reply(`🔄 *Invite link reset!*\n\nThe old link no longer works. New link:\n${link}`);

        } catch (e) {
            console.error("Resetlink error:", e);
            reply("⚠️ Failed to reset invite link. Make sure the bot is an admin.");
        }
    }
};
