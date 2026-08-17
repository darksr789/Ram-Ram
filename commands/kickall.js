// === kickall.js ===
// Removes every non-admin member from the group. Group admins, the bot
// itself, and the owner are always skipped for safety.
module.exports = {
  pattern: "kickall",
  desc: "Remove all non-admin members from the group (Admin/Owner Only)",
  category: "group",
  react: "👢",
  filename: __filename,
  use: ".kickall",

  execute: async (conn, message, m, { from, isGroup, reply, sender }) => {
    try {
      if (!isGroup) return reply("❌ This command can only be used in groups.");

      let metadata;
      try {
        metadata = await conn.groupMetadata(from);
      } catch {
        return reply("❌ Failed to get group info.");
      }

      const jidToBase = (jid) => String(jid).split("@")[0].split(":")[0];
      const senderBase = jidToBase(sender);

      const participant = metadata.participants.find(p => jidToBase(p.id) === senderBase);
      const isAdmin = participant?.admin === "admin" || participant?.admin === "superadmin";

      let owners = [];
      if (process.env.OWNER_NUMBER) {
        owners = process.env.OWNER_NUMBER.split(",").map(n => n.trim());
      }
      const botBase = jidToBase(conn?.user?.id || "");
      const isOwner = botBase === senderBase || owners.includes(senderBase);

      if (!isAdmin && !isOwner) return reply("❌ Only group admins or the bot owner can use this command.");

      // The bot itself must be a group admin to remove anyone
      const botJid = conn.user.id;
      const botParticipant = metadata.participants.find(p => jidToBase(p.id) === jidToBase(botJid));
      const botIsAdmin = botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";
      if (!botIsAdmin) {
        return reply("❌ I need to be a group admin to kick members.");
      }

      // Build the removal list: skip all admins, the bot, and the owner
      const toRemove = metadata.participants
        .filter(p => {
          const base = jidToBase(p.id);
          const pIsAdmin = p.admin === "admin" || p.admin === "superadmin";
          return !pIsAdmin && base !== botBase && !owners.includes(base);
        })
        .map(p => p.id);

      if (toRemove.length === 0) {
        return reply("ℹ️ No non-admin members to remove.");
      }

      await conn.sendMessage(from, { react: { text: "👢", key: message.key } });
      await reply(`👢 Removing *${toRemove.length}* member(s)... this may take a moment.`);

      let removed = 0;
      let failed = 0;

      // Remove one at a time with a short delay — removing everyone in a
      // single burst is a common way self-bot numbers get flagged/banned
      // by WhatsApp for abusive behaviour.
      for (const jid of toRemove) {
        try {
          await conn.groupParticipantsUpdate(from, [jid], "remove");
          removed++;
        } catch (err) {
          console.error(`Kickall: failed to remove ${jid}:`, err.message);
          failed++;
        }
        await new Promise(r => setTimeout(r, 1500)); // 1.5s gap between removals
      }

      await conn.sendMessage(from, {
        text: `✅ Kickall complete.\n\n👢 Removed: *${removed}*\n❌ Failed: *${failed}*`,
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
      console.error("Kickall error:", e);
      await conn.sendMessage(from, { react: { text: "❌", key: message.key } });
      await conn.sendMessage(from, {
        text: "⚠️ Failed to run kickall.",
        contextInfo: {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "120363419670264413@newsletter",
            newsletterName: "ֆʊʀʏǟӼ  ",
            serverMessageId: 143
          }
        }
      }, { quoted: message });
    }
  }
};
