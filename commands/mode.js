// === commands/mode.js ===
const { getMode, setMode } = require('../lib/botmode');

module.exports = {
    pattern: "mode",
    desc: "Check or change bot mode (Public/Private)",
    category: "owner",
    filename: __filename,
    use: ".mode / .mode public / .mode private",

    execute: async (conn, message, m, { isCreator, reply, args, sessionId }) => {
        try {
            if (!isCreator) return reply("❌ Owner only!");

            // Get current mode from bot
            let currentMode = getMode(sessionId);

            // If no args, show current mode
            if (!args[0]) {
                return reply(`⚙️ *Bot Mode*\n\n📌 Current mode: *${currentMode.toUpperCase()}*\n\n📝 Usage:\n.mode public - Public mode (everyone can use)\n.mode private - Private mode (only owner can use)`);
            }

            const mode = args[0].toLowerCase();

            if (mode === 'public') {
                setMode(sessionId, 'public');
                conn.public = true;
                return reply("✅ *Public mode ON*\n\nEveryone can use the bot now.");
            }

            if (mode === 'private' || mode === 'self') {
                setMode(sessionId, 'private');
                conn.public = false;
                return reply("✅ *Private mode ON*\n\nOnly bot owner can use the bot now.");
            }

            return reply("❌ Invalid mode!\n\nUse: .mode public or .mode private");

        } catch (err) {
            console.error("Mode error:", err);
            reply("❌ Failed to change bot mode.");
        }
    }
};
