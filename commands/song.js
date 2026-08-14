const yts = require('yt-search');
const axios = require('axios');
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

            // Using direct API buffer to bypass YouTube Status Code 429 rate limits
            const apiUrl = `https://api.cobalt.tools/api/json`;
            
            const response = await axios.post(apiUrl, {
                url: video.url,
                downloadMode: "audio",
                audioFormat: "mp3"
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.url) {
                // Send downloaded audio directly to WhatsApp
                await conn.sendMessage(from, {
                    audio: { url: response.data.url },
                    mimetype: 'audio/mp4',
                    fileName: `${video.title}.mp3`
                }, { quoted: message });
            } else {
                // Fallback API if primary is busy
                const fallbackUrl = `https://api.dreaded.site/api/ytdl/video?url=${encodeURIComponent(video.url)}`;
                const fallbackRes = await axios.get(fallbackUrl);
                
                if (fallbackRes.data && fallbackRes.data.result && fallbackRes.data.result.download) {
                    await conn.sendMessage(from, {
                        audio: { url: fallbackRes.data.result.download.url },
                        mimetype: 'audio/mp4',
                        fileName: `${video.title}.mp3`
                    }, { quoted: message });
                } else {
                    reply("❌ *Failed to fetch download link. Please try again in a few moments!*");
                }
            }

        } catch (error) {
            console.error("Song command error:", error);
            reply("❌ *An error occurred while downloading the song. YouTube rate limit hit, try again in a minute!*");
        }
    }
};
