// === getpp.js ===
module.exports = {
    pattern: "getpp",
    desc: "Get a user's profile picture (mention, reply, or number)",
    category: "group",
    react: "🖼️",
    filename: __filename,
    use: ".getpp [@user | reply | number]",

    execute: async (conn, message, m, { from, isGroup, reply, args, sender }) => {
        try {
            let target = null;

            if (m.mentionedJid && m.mentionedJid.length > 0) {
                target = m.mentionedJid[0];
            } else if (m.quoted && m.quoted.sender) {
                target = m.quoted.sender;
            } else if (args[0]) {
                const raw = args[0].replace(/[^0-9]/g, "");
                if (raw) target = `${raw}@s.whatsapp.net`;
            } else {
                target = isGroup ? sender : from;
            }

            if (!target) return reply("❌ Mention a user, reply to their message, or provide a number.");

            let ppUrl;
            try {
                ppUrl = await conn.profilePictureUrl(target, "image");
            } catch (e) {
                return reply("❌ This user has no profile picture, or it's set to private.");
            }

            await conn.sendMessage(from, {
                image: { url: ppUrl },
                caption: `🖼️ Profile picture of @${target.split("@")[0]}`,
                mentions: [target]
            }, { quoted: message });

        } catch (e) {
            console.error("Getpp error:", e);
            reply("⚠️ Failed to fetch profile picture.");
        }
    }
};
