// === unmute.js ===
module.exports = {
    pattern: "unmute",
    desc: "Open the group so everyone can send messages (Admins Only)",
    category: "group",
    react: "🔓",
    filename: __filename,
    use: ".unmute",

    execute: async (conn, message, m, { from, isGroup, isAdmins, isOwner, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isAdmins && !isOwner) return reply("❌ Only admins can use this command.");

            await conn.groupSettingUpdate(from, "not_announcement");

            await conn.sendMessage(from, { react: { text: "✅", key: message.key } });
            await conn.sendMessage(from, {
                text: "🔓 Group is now open. Everyone can send messages.",
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363419670264413@newsletter",
                        newsletterName: "ֆʊʀʏǟӼ  ",
                        serverMessageId: 200
                    }
                }
            }, { quoted: message });

        } catch (e) {
            console.error("Unmute error:", e);
            await conn.sendMessage(from, { react: { text: "❌", key: message.key } });
            reply("⚠️ Failed to unmute the group.");
        }
    }
};
