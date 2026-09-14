// === add.js ===
module.exports = {
    pattern: "add",
    desc: "Add a member to the group by number (Admin/Owner Only)",
    category: "group",
    react: "➕",
    filename: __filename,
    use: ".add <number with country code>",

    execute: async (conn, message, m, { from, isGroup, isAdmins, isOwner, reply, args }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isAdmins && !isOwner) return reply("❌ Only admins can use this command.");

            const raw = (args[0] || "").replace(/[^0-9]/g, "");
            if (!raw) return reply("❌ Provide a valid number.\n\n📌 Usage: .add 91xxxxxxxxx");

            const targetJid = `${raw}@s.whatsapp.net`;

            await conn.sendMessage(from, { react: { text: "➕", key: message.key } });

            const result = await conn.groupParticipantsUpdate(from, [targetJid], "add");

            const status = result?.[0]?.status;
            if (status === "403") {
                return reply(`⚠️ Couldn't add @${raw} directly (their privacy settings block it). They may need to join via invite link.`, { mentions: [targetJid] });
            }

            await conn.sendMessage(from, {
                text: `✅ Added @${raw} to the group.`,
                mentions: [targetJid]
            }, { quoted: message });

        } catch (e) {
            console.error("Add error:", e);
            await conn.sendMessage(from, { react: { text: "❌", key: message.key } });
            reply("⚠️ Failed to add member.");
        }
    }
};
