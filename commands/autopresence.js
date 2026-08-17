// === commands/autopresence.js ===
// .autotyping on/off and .autorecording on/off — owner only, per-session
// (only affects the bot linked to the number that runs the command).
const { getPresenceMode, setPresenceMode } = require('../lib/autoPresence');

module.exports = {
    autotyping: {
        pattern: "autotyping",
        desc: "Toggle auto 'typing...' indicator when the bot receives a message",
        category: "owner",
        filename: __filename,
        use: ".autotyping on/off",

        execute: async (conn, message, m, { isOwner, reply, q, sessionId }) => {
            try {
                if (!isOwner) return reply("❌ Owner only!");

                const current = getPresenceMode(sessionId);

                if (!q) {
                    return reply(`⚙️ *Auto Typing*\n\n📌 Current status: *${current === 'typing' ? "ON ✅" : "OFF ❌"}*\n\n📝 Usage: .autotyping on / .autotyping off`);
                }

                if (q.toLowerCase() === 'on') {
                    setPresenceMode(sessionId, 'typing');
                    return reply("✅ Auto typing indicator enabled.");
                }
                if (q.toLowerCase() === 'off') {
                    // Only clear it if typing is what's currently set, so
                    // toggling this off doesn't accidentally disable
                    // autorecording if that was the active mode instead.
                    if (current === 'typing') setPresenceMode(sessionId, 'off');
                    return reply("❌ Auto typing indicator disabled.");
                }
                return reply("❌ Invalid option!\n\nUse: .autotyping on or .autotyping off");
            } catch (err) {
                console.error("Autotyping error:", err);
                reply("❌ Failed to change auto typing setting.");
            }
        }
    },

    autorecording: {
        pattern: "autorecording",
        desc: "Toggle auto 'recording audio...' indicator when the bot receives a message",
        category: "owner",
        filename: __filename,
        use: ".autorecording on/off",

        execute: async (conn, message, m, { isOwner, reply, q, sessionId }) => {
            try {
                if (!isOwner) return reply("❌ Owner only!");

                const current = getPresenceMode(sessionId);

                if (!q) {
                    return reply(`⚙️ *Auto Recording*\n\n📌 Current status: *${current === 'recording' ? "ON ✅" : "OFF ❌"}*\n\n📝 Usage: .autorecording on / .autorecording off`);
                }

                if (q.toLowerCase() === 'on') {
                    setPresenceMode(sessionId, 'recording');
                    return reply("✅ Auto recording indicator enabled.");
                }
                if (q.toLowerCase() === 'off') {
                    if (current === 'recording') setPresenceMode(sessionId, 'off');
                    return reply("❌ Auto recording indicator disabled.");
                }
                return reply("❌ Invalid option!\n\nUse: .autorecording on or .autorecording off");
            } catch (err) {
                console.error("Autorecording error:", err);
                reply("❌ Failed to change auto recording setting.");
            }
        }
    }
};
