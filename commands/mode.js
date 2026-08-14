// === commands/mode.js ===
// Provides .mode (public/private), plus direct .public, .private and .self shortcuts.

const fs = require('fs');
const path = require('path');

const botModeFile = path.join(__dirname, '../database', 'botmode.txt');

function writeMode(mode) {
    const dir = path.dirname(botModeFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(botModeFile, mode);
}

function readMode() {
    try {
        if (fs.existsSync(botModeFile)) {
            return fs.readFileSync(botModeFile, 'utf-8').trim() === 'private' ? 'private' : 'public';
        }
    } catch {}
    return 'public';
}

module.exports = {
    mode: {
        pattern: "mode",
        desc: "Check or change bot mode (Public/Private)",
        category: "owner",
        filename: __filename,
        use: ".mode / .mode public / .mode private",

        execute: async (conn, message, m, { isOwner, reply, args }) => {
            try {
                if (!args[0]) {
                    const currentMode = readMode();
                    return reply(`⚙️ *Bot Mode*\n\n📌 Current mode: *${currentMode.toUpperCase()}*\n\n📝 Usage:\n.mode public - Public mode (everyone can use)\n.mode private - Private mode (only owner can use)\n\nShortcuts: .public , .self , .private`);
                }

                const mode = args[0].toLowerCase();

                if (mode === 'public') {
                    writeMode('public');
                    return reply("✅ *Public mode ON*\n\nEveryone can use the bot now.");
                }

                if (mode === 'private' || mode === 'self') {
                    writeMode('private');
                    return reply("✅ *Private mode ON*\n\nOnly the bot owner can use the bot now.");
                }

                return reply("❌ Invalid mode!\n\nUse: .mode public or .mode private");

            } catch (err) {
                console.error("Mode error:", err);
                reply("❌ Failed to change bot mode.");
            }
        }
    },

    public: {
        pattern: "public",
        alias: [],
        desc: "Switch bot to public mode (everyone can use)",
        category: "main",
        filename: __filename,
        use: ".public",

        execute: async (conn, message, m, { reply }) => {
            try {
                writeMode('public');
                return reply("✅ *Public mode ON*\n\nEveryone can use the bot now.");
            } catch (err) {
                console.error("Public mode error:", err);
                reply("❌ Failed to change bot mode.");
            }
        }
    },

    self: {
        pattern: "self",
        alias: ["private"],
        desc: "Switch bot to private/self mode (only owner can use)",
        category: "main",
        filename: __filename,
        use: ".self / .private",

        execute: async (conn, message, m, { reply }) => {
            try {
                writeMode('private');
                return reply("✅ *Private mode ON*\n\nOnly the bot owner can use the bot now.");
            } catch (err) {
                console.error("Self mode error:", err);
                reply("❌ Failed to change bot mode.");
            }
        }
    }
};
