const ytSearch = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = {
    pattern: "play",
    alias: ["song"],
    desc: "Search and download a YouTube track as playable audio",
    react: "🎧",
    category: "music",
    filename: __filename,
    use: ".play <song name or YouTube link>",

    execute: async (conn, mek, m, { from, args, q, reply }) => {
        const sendMessageWithContext = async (text, quoted = mek) => {
            return await conn.sendMessage(from, {
                text: text,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363419670264413@newsletter",
                        newsletterName: "ֆʊʀʏǟӼ",
                        serverMessageId: 200
                    }
                }
            }, { quoted: quoted });
        };

        let tempFilePath = null;

        try {
            const query = q || args.join(" ");
            if (!query) {
                return await sendMessageWithContext(
`❎ Please provide a song name or YouTube link.

📌 Examples:
.play bado badi
.play https://www.youtube.com/watch?v=xxxxxxxxxxx`);
            }

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: mek.key } });
            }

            // Resolve to a YouTube video URL
            let videoUrl = null;
            let videoTitle = null;
            let videoDuration = null;
            let videoThumbnail = null;
            let videoChannel = null;

            const isYoutubeUrl = ytdl.validateURL(query);

            if (isYoutubeUrl) {
                videoUrl = query;
                try {
                    const info = await ytdl.getBasicInfo(videoUrl);
                    videoTitle = info.videoDetails.title;
                    videoDuration = Number(info.videoDetails.lengthSeconds);
                    videoThumbnail = info.videoDetails.thumbnails?.pop()?.url;
                    videoChannel = info.videoDetails.author?.name;
                } catch (err) {
                    console.error("🎵 ytdl.getBasicInfo failed:", err.message);
                    return await sendMessageWithContext("❌ Couldn't read that YouTube link. It may be private, age-restricted, or invalid.");
                }
            } else {
                await sendMessageWithContext(`🔎 Searching for: *${query}* ...`);
                let searchResult;
                try {
                    searchResult = await ytSearch(query);
                } catch (err) {
                    console.error("🎵 yt-search failed:", err.message);
                    return await sendMessageWithContext("❌ Search failed. Please try again.");
                }

                const first = searchResult?.videos?.[0];
                if (!first) {
                    return await sendMessageWithContext(`❌ No results found for: *${query}*`);
                }

                videoUrl = first.url;
                videoTitle = first.title;
                videoDuration = first.seconds;
                videoThumbnail = first.thumbnail;
                videoChannel = first.author?.name;
            }

            // Skip extremely long videos to avoid huge downloads (over 20 minutes)
            if (videoDuration && videoDuration > 1200) {
                return await sendMessageWithContext("❌ That track is too long (over 20 minutes). Please try a shorter one.");
            }

            await sendMessageWithContext(`🎶 Downloading: *${videoTitle || "audio"}* ... Please wait.`);

            // Download audio-only stream to a temp file, with a couple of
            // retries since YouTube's 429 (Too Many Requests) is often
            // temporary/IP based and clears up after a short pause.
            tempFilePath = path.join(os.tmpdir(), `song_${Date.now()}.m4a`);

            const downloadOnce = () => new Promise((resolve, reject) => {
                const stream = ytdl(videoUrl, {
                    filter: "audioonly",
                    quality: "highestaudio",
                    requestOptions: {
                        headers: {
                            // A normal browser UA reduces (does not fully stop) 429s from YouTube
                            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                        }
                    }
                });

                const writeStream = fs.createWriteStream(tempFilePath);

                stream.on("error", (err) => {
                    console.error("🎵 ytdl download stream error:", err.message);
                    reject(err);
                });
                writeStream.on("error", (err) => {
                    console.error("🎵 write stream error:", err.message);
                    reject(err);
                });
                writeStream.on("finish", resolve);

                stream.pipe(writeStream);
            });

            const is429 = (err) => /429|too many requests/i.test(err?.message || "");
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

            let lastErr = null;
            const MAX_ATTEMPTS = 3;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    lastErr = null;
                    await downloadOnce();
                    break; // success
                } catch (err) {
                    lastErr = err;
                    if (is429(err) && attempt < MAX_ATTEMPTS) {
                        console.log(`🎵 Got 429, retrying (${attempt}/${MAX_ATTEMPTS - 1})...`);
                        await sleep(4000 * attempt); // backoff: 4s, 8s
                        continue;
                    }
                    break; // non-429 error, or out of attempts
                }
            }

            if (lastErr) {
                if (is429(lastErr)) {
                    throw new Error("YouTube is rate-limiting this server right now (Status code: 429). This is temporary — please wait a few minutes and try again.");
                }
                throw lastErr;
            }

            let thumbBuffer;
            if (videoThumbnail) {
                try {
                    const axios = require("axios");
                    const res = await axios.get(videoThumbnail, { responseType: "arraybuffer", timeout: 10000 });
                    thumbBuffer = Buffer.from(res.data);
                } catch {
                    thumbBuffer = null;
                }
            }

            const durationText = videoDuration
                ? `${Math.floor(videoDuration / 60)}:${String(videoDuration % 60).padStart(2, "0")}`
                : "Unknown";

            const caption = `🎵 *Track Info*\n\n` +
                            `📖 *Title:* ${videoTitle || "Unknown"}\n` +
                            `👤 *Channel:* ${videoChannel || "Unknown"}\n` +
                            `⏱️ *Duration:* ${durationText}\n` +
                            `🌐 *Source:* YouTube\n\n` +
                            `> _ᴘᴏᴡᴇʀᴇᴅ ʙʏ ꜱᴜʀʏᴀ-x - ᴍɪɴɪ_`;

            await conn.sendMessage(from, {
                audio: fs.readFileSync(tempFilePath),
                mimetype: "audio/mp4",
                fileName: `${(videoTitle || "audio").replace(/[^\w\s]/gi, "")}.m4a`,
                caption: caption,
                jpegThumbnail: thumbBuffer,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363419670264413@newsletter",
                        newsletterName: "ֆʊʀʏǟӼ",
                        serverMessageId: 200
                    }
                }
            }, { quoted: mek });

        } catch (e) {
            console.error("❌ Play Command Error:", e.message);
            await sendMessageWithContext(`⚠️ Error: ${e.message}`);
        } finally {
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                fs.unlink(tempFilePath, () => {});
            }
        }
    }
};
