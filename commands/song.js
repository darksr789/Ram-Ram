const ytdl = require("ytdl-core");
const ytSearch = require("yt-search");

module.exports = {
    pattern: "play",
    desc: "Search and download audio from YouTube",
    react: "🎧",
    category: "music",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, q, reply }) => {
        try {
            const query = q || args.join(" ");
            if (!query) {
                return reply("❌ Please provide a song name or YouTube link.\n📌 Example: .play Bado Badi");
            }

            const searchResults = await ytSearch(query);
            if (!searchResults || searchResults.videos.length === 0) {
                return reply("❌ No results found.");
            }

            const video = searchResults.videos[0];
            const videoUrl = video.url;

            const audioStream = ytdl(videoUrl, {
                filter: "audioonly",
                quality: "highestaudio"
            });

            await conn.sendMessage(from, {
                audio: { stream: audioStream },
                mimetype: "audio/mpeg",
                fileName: `${video.title.replace(/[^\w\s]/gi, '')}.mp3`,
                caption: `🎵 *${video.title}*\n👤 *${video.author.name}*\n⏱️ *${video.duration.timestamp}*`
            }, { quoted: mek });

        } catch (e) {
            console.error("Play Command Error:", e);
            reply(`⚠️ Error: ${e.message}`);
        }
    }
};
