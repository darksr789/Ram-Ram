const ytSearch = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Optional: to fix YouTube's "Sign in to confirm you're not a bot" error,
// export your YouTube cookies (while logged into a real account) as JSON
// using a browser extension like "Get cookies.txt LOCALLY", and save the
// array to config/youtube_cookies.json. If present, we use it to build an
// authenticated agent for the ytdl-core fallback below.
const COOKIES_PATH = path.join(__dirname, "..", "config", "youtube_cookies.json");
let ytdlAgent = null;
try {
    if (fs.existsSync(COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
        if (Array.isArray(cookies) && cookies.length > 0) {
            ytdlAgent = ytdl.createAgent(cookies);
            console.log("🎵 ytmp3: loaded YouTube cookies for authenticated requests");
        }
    }
} catch (err) {
    console.error("🎵 ytmp3: failed to load youtube_cookies.json:", err.message);
}

// Third-party YouTube-to-MP3 API. Tried FIRST because the download happens
// on their server (not ours), so our server's IP never talks to YouTube
// directly for this path — it sidesteps our IP being 429/bot-check blocked.
// NOTE: this is a free third-party service, not run by us — it can go down,
// change, or disappear at any time. That's why we still keep the ytdl-core
// method below as an automatic fallback.
const EXTERNAL_API_URL = "https://arslan-apis-v2.vercel.app/download/ytmp3";

async function tryExternalApi(videoUrl) {
    const apiUrl = `${EXTERNAL_API_URL}?url=${encodeURIComponent(videoUrl)}`;
    const res = await axios.get(apiUrl, { timeout: 60000 });

    const dlUrl = res?.data?.result?.download?.url;
    if (!res?.data?.status || !dlUrl) {
        throw new Error("External API did not return a download link");
    }
    return dlUrl;
}

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
                    const info = await ytdl.getBasicInfo(videoUrl, ytdlAgent ? { agent: ytdlAgent } : {});
                    videoTitle = info.videoDetails.title;
                    videoDuration = Number(info.videoDetails.lengthSeconds);
                    videoThumbnail = info.videoDetails.thumbnails?.pop()?.url;
                    videoChannel = info.videoDetails.author?.name;
                } catch (err) {
                    console.error("🎵 ytdl.getBasicInfo failed:", err.message);
                    return await sendMessageWithContext("❌ Couldn't read that YouTube link. It may be private, age-restricted, or invalid.");
                }
            } else {
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

            const durationText = videoDuration
                ? `${Math.floor(videoDuration / 60)}:${String(videoDuration % 60).padStart(2, "0")}`
                : "Unknown";

            // Show just the name + thumbnail (no "Searching..."/"Downloading..."
            // spam) while the audio downloads in the background.
            let thumbBuffer;
            if (videoThumbnail) {
                try {
                    const res = await axios.get(videoThumbnail, { responseType: "arraybuffer", timeout: 10000 });
                    thumbBuffer = Buffer.from(res.data);
                } catch {
                    thumbBuffer = null;
                }
            }

            const infoCaption = `🎵 *${videoTitle || "Unknown"}*\n` +
                                 `👤 ${videoChannel || "Unknown"} • ⏱️ ${durationText}`;

            if (thumbBuffer) {
                await conn.sendMessage(from, {
                    image: thumbBuffer,
                    caption: infoCaption
                }, { quoted: mek });
            } else {
                await sendMessageWithContext(infoCaption);
            }

            const audioContext = {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363419670264413@newsletter",
                    newsletterName: "ֆʊʀʏǟӼ",
                    serverMessageId: 200
                }
            };

            // ---- METHOD 1: third-party API (tried first — offloads the
            // YouTube request to their server, so our IP being rate-limited
            // or bot-checked usually doesn't matter here). ----
            try {
                const dlUrl = await tryExternalApi(videoUrl);
                await conn.sendMessage(from, {
                    audio: { url: dlUrl },
                    mimetype: "audio/mpeg",
                    ptt: false,
                    fileName: `${(videoTitle || "audio").replace(/[^\w\s]/gi, "")}.mp3`,
                    contextInfo: audioContext
                }, { quoted: mek });
                return; // done — no need for the fallback below
            } catch (err) {
                console.error("🎵 External API failed, falling back to ytdl-core:", err.message);
            }

            // ---- METHOD 2: local ytdl-core download (fallback). Retries
            // across attempts and a couple of quality options since 429s
            // and format-selection errors are often transient. ----
            tempFilePath = path.join(os.tmpdir(), `song_${Date.now()}.m4a`);

            const buildOptions = (quality) => ({
                filter: "audioonly",
                quality,
                highWaterMark: 1 << 25,
                ...(ytdlAgent ? { agent: ytdlAgent } : {}),
                requestOptions: {
                    headers: {
                        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    }
                }
            });

            const downloadOnce = (quality) => new Promise((resolve, reject) => {
                let settled = false;
                const stream = ytdl(videoUrl, buildOptions(quality));

                const writeStream = fs.createWriteStream(tempFilePath);

                const fail = (err) => {
                    if (settled) return;
                    settled = true;
                    stream.destroy();
                    writeStream.destroy();
                    reject(err);
                };

                stream.on("error", (err) => {
                    console.error("🎵 ytdl download stream error:", err.message);
                    fail(err);
                });
                writeStream.on("error", (err) => {
                    console.error("🎵 write stream error:", err.message);
                    fail(err);
                });
                writeStream.on("finish", () => {
                    if (settled) return;
                    settled = true;
                    resolve();
                });

                stream.pipe(writeStream);
            });

            const is429 = (err) => /429|too many requests/i.test(err?.message || "");
            const isBotCheck = (err) => /sign in to confirm|not a bot/i.test(err?.message || "");
            const isRetryable = (err) => is429(err) || /ECONNRESET|ETIMEDOUT|socket hang up|network|fetch failed/i.test(err?.message || "");
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

            const qualities = ["highestaudio", "lowestaudio"];
            let lastErr = null;
            const MAX_ATTEMPTS_PER_QUALITY = 3;

            outer:
            for (const quality of qualities) {
                for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_QUALITY; attempt++) {
                    try {
                        lastErr = null;
                        await downloadOnce(quality);
                        break outer; // success
                    } catch (err) {
                        lastErr = err;
                        if (isBotCheck(err)) break outer; // won't help to retry without cookies
                        if (isRetryable(err) && attempt < MAX_ATTEMPTS_PER_QUALITY) {
                            console.log(`🎵 Download failed (${err.message}), retrying attempt ${attempt + 1}/${MAX_ATTEMPTS_PER_QUALITY} on ${quality}...`);
                            await sleep(4000 * attempt); // backoff: 4s, 8s
                            continue;
                        }
                        break; // try the next quality option
                    }
                }
            }

            if (lastErr) {
                if (isBotCheck(lastErr)) {
                    throw new Error(ytdlAgent
                        ? "YouTube blocked this download even with cookies (Sign in to confirm you're not a bot). Your saved cookies may have expired — please re-export them."
                        : "YouTube is blocking this download (Sign in to confirm you're not a bot). This needs YouTube account cookies to fix — ask the bot admin to add config/youtube_cookies.json.");
                }
                if (is429(lastErr)) {
                    throw new Error("YouTube is rate-limiting this server right now (Status code: 429). This is temporary — please wait a few minutes and try again.");
                }
                throw lastErr;
            }

            await conn.sendMessage(from, {
                audio: fs.readFileSync(tempFilePath),
                mimetype: "audio/mp4",
                fileName: `${(videoTitle || "audio").replace(/[^\w\s]/gi, "")}.m4a`,
                jpegThumbnail: thumbBuffer,
                contextInfo: audioContext
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
