const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');

module.exports = {
    pattern: 'song',
    alias: ['play', 'sing'],
    tags: ['download'],
    execute: async (conn, message, m, { args, q, reply, from }) => {
        try {
            if (!q) {
                return reply("🎵 *Please provide a song name or YouTube URL!*\n\n*Example:* `.song Indila`");
            }

            await reply(`🔍 *Searching for:* **${q}** ...`);

            // Search song on YouTube
            const search = await yts(q);
            const video = search.videos[0];

            if (!video) {
                return reply("❌ *No results found on YouTube!*");
            }

            await reply(`🎶 *Downloading:* **${video.title}** ... Please wait.`);

            // Temporary path for audio file
            const filePath = path.join(__dirname, `../temp_${Date.now()}.mp3`);

            // FIXED: Standard audio filter without invalid 'highestaudio' quality string
            const stream = ytdl(video.url, { 
                filter: 'audioonly' 
            });
            const fileStream = fs.createWriteStream(filePath);

            stream.pipe(fileStream);

            fileStream.on('finish', async () => {
                // Send audio to WhatsApp chat
                await conn.sendMessage(from, {
                    audio: fs.readFileSync(filePath),
                    mimetype: 'audio/mp4',
                    fileName: `${video.title}.mp3`
                }, { quoted: message });

                // Clean up temporary file
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });

            stream.on('error', (err) => {
                console.error("YTDL Error:", err);
                reply("❌ *Failed to download audio from YouTube. Please try again later.*");
            });

        } catch (error) {
            console.error("Song command error:", error);
            reply("❌ *An error occurred while playing the song!*");
        }
    }
};
