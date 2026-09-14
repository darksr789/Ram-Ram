// === listadmin.js ===
module.exports = {
    pattern: "listadmin",
    desc: "List all admins in this group",
    category: "group",
    react: "👑",
    filename: __filename,
    use: ".listadmin",

    execute: async (conn, message, m, { from, isGroup, groupMetadata, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            const metadata = groupMetadata || await conn.groupMetadata(from);
            const admins = metadata.participants.filter(p => p.admin === "admin" || p.admin === "superadmin");

            if (admins.length === 0) {
                return reply("❌ No admins found in this group.");
            }

            let text = `👑 *Group Admins (${admins.length})*\n\n`;
            const mentions = [];

            for (const admin of admins) {
                const tag = admin.admin === "superadmin" ? "👑 Owner" : "🛡️ Admin";
                text += `${tag} — @${admin.id.split("@")[0]}\n`;
                mentions.push(admin.id);
            }

            await conn.sendMessage(from, { text, mentions }, { quoted: message });

        } catch (e) {
            console.error("Listadmin error:", e);
            reply("⚠️ Failed to fetch admin list.");
        }
    }
};
