// === join.js ===
module.exports = {
    pattern: "join",
    desc: "Make the bot join a group via invite link (Owner Only)",
    category: "group",
    react: "🔗",
    filename: __filename,
    use: ".join <group invite link>",

    execute: async (conn, message, m, { from, isOwner, reply, args, q }) => {
        try {
            if (!isOwner) return reply("❌ Owner only!");

            const link = q || args[0];
            if (!link) return reply("❌ Provide a group invite link.\n\n📌 Usage: .join https://chat.whatsapp.com/xxxxxxxx");

            const match = link.match(/chat\.whatsapp\.com\/([0-9A-Za-z]+)/);
            if (!match) return reply("❌ That doesn't look like a valid WhatsApp group invite link.");

            const inviteCode = match[1];

            await conn.groupAcceptInvite(inviteCode);

            reply("✅ Successfully joined the group!");

        } catch (e) {
            console.error("Join error:", e);
            reply("⚠️ Failed to join the group. The link may be invalid, expired, or the bot may already be a member.");
        }
    }
};
