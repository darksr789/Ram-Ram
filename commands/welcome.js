// === welcome.js ===
const { isWelcomeEnabled, setWelcome } = require('../lib/groupToggles');

module.exports = {
  pattern: "welcome",
  desc: "Toggle welcome messages (Owner/Admin only)",
  category: "group",
  react: "🎒",
  use: ".welcome on/off",
  filename: __filename,

  execute: async (conn, message, m, { q, reply, from, isGroup, sender }) => {
    try {
      if (!isGroup) {
        return reply("❌ This command only works inside a group.");
      }

      // --- normalize JIDs ---
      const jidToBase = (jid) => String(jid).split("@")[0].split(":")[0];
      const senderBase = jidToBase(sender);
      const botBase = jidToBase(conn?.user?.id || "");

      // --- Owner check (from .env) ---
      let owners = [];
      if (process.env.OWNER_NUMBER) {
        owners = process.env.OWNER_NUMBER.split(",").map(num => num.trim());
      }
      const isOwner = botBase === senderBase || owners.includes(senderBase);

      // --- Admin check ---
      let isAdmin = false;
      try {
        const metadata = await conn.groupMetadata(from);
        const participant = metadata.participants.find(p => jidToBase(p.id) === senderBase);
        isAdmin = participant?.admin === "admin" || participant?.admin === "superadmin";
      } catch {
        return reply("❌ Failed to get group information.");
      }

      // --- Permissions ---
      if (!isOwner && !isAdmin) {
        return reply("❌ Only group admins or the bot owner can toggle this.");
      }

      // --- Toggle logic (stored per-group, in the SAME place the
      // welcome-message sender actually reads from) ---
      if (!q) {
        return reply(
          `⚙️ Usage: \`.welcome on\` or \`.welcome off\`\n\n📡 Current status: *${isWelcomeEnabled(from) ? "ON ✅" : "OFF ❌"}*`
        );
      }

      if (q.toLowerCase() === "on") {
        setWelcome(from, true);
        await conn.sendMessage(from, { react: { text: "🎒", key: message.key } });
        return reply("✅ Welcome messages enabled.\n\n📡 Current status: *ON*");
      } else if (q.toLowerCase() === "off") {
        setWelcome(from, false);
        await conn.sendMessage(from, { react: { text: "🎒", key: message.key } });
        return reply("❌ Welcome messages disabled.\n\n📡 Current status: *OFF*");
      } else {
        return reply(
          `⚙️ Usage: \`.welcome on\` or \`.welcome off\`\n\n📡 Current status: *${isWelcomeEnabled(from) ? "ON ✅" : "OFF ❌"}*`
        );
      }

    } catch (e) {
      console.error("Welcome command error:", e);
      await conn.sendMessage(from, { react: { text: "❌", key: message.key } });
      reply("⚠️ Failed to toggle welcome messages.");
    }
  }
};
