// === GroupEvents.js ===
const { isJidGroup } = require('@whiskeysockets/baileys');
const { isWelcomeEnabled, isGoodbyeEnabled } = require('../lib/groupToggles');

// ========== TRACK SENT MESSAGES ==========
const sentTracker = new Set();

module.exports = async (conn, update) => {
    try {
        const { id, participants, action } = update;
        if (!id || !isJidGroup(id) || !participants) return;

        for (const participant of participants) {
            const userName = participant.split("@")[0];

            // Duplicate check
            const msgKey = `${id}_${action}_${participant}`;
            if (sentTracker.has(msgKey)) {
                console.log(`⏭️ Already sent ${action} for ${userName}, skipping...`);
                continue;
            }

            // ========== WELCOME ==========
            if (action === "add") {
                if (!isWelcomeEnabled(id)) {
                    console.log(`⏭️ Welcome disabled for ${id}`);
                    continue;
                }

                sentTracker.add(msgKey);

                const welcomeText = `@${userName} *_ᗯᗴᒪᑕᗝᗰᗴ  ᕼᗝǤƳᗩ  ᗩᑭᛕᗩ  ᗪᗝᔕ丅 💗👀🥹_*`;

                await conn.sendMessage(id, {
                    text: welcomeText,
                    mentions: [participant]
                });

                console.log(`✅ Welcome sent to ${userName}`);
            }

            // ========== GOODBYE ==========
            else if (action === "remove") {
                if (!isGoodbyeEnabled(id)) {
                    console.log(`⏭️ Goodbye disabled for ${id}`);
                    continue;
                }

                sentTracker.add(msgKey);

                const goodbyeText = `@${userName} *_left us we will miss😔💗_*`;

                await conn.sendMessage(id, {
                    text: goodbyeText,
                    mentions: [participant]
                });

                console.log(`✅ Goodbye sent to ${userName}`);
            }
        }

    } catch (err) {
        console.error("GroupEvents error:", err);
    }
};
