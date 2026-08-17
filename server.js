const express = require("express");
const http = require("http");
require("dotenv").config();
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require("@whiskeysockets/baileys");
const P = require("pino");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

const GroupEvents = require("./events/GroupEvents");
const runtimeTracker = require('./commands/runtime');
const { getSetting, incrementWarn, resetWarn } = require('./Settings.js');
const { getMode: getBotModeForSession } = require('./lib/botmode');
const { getPresenceMode } = require('./lib/autoPresence');

function isBotOwner(conn, sender) {
    try {
        if (!sender) return false;
        const cleanSender = sender.split("@")[0].split(":")[0];
        const botNumber = conn.user && conn.user.id ? conn.user.id.split("@")[0].split(":")[0] : "";
        
        // Match with connected bot number or ENV owner number if present
        const envOwner = process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER.replace(/\D/g, '') : '';
        return cleanSender === botNumber || (envOwner && cleanSender === envOwner);
    } catch {
        return false;
    }
}

// Matches http(s) links, bare www. links, and WhatsApp group invite links
const LINK_REGEX = /(https?:\/\/\S+)|(www\.\S+)|(chat\.whatsapp\.com\/\S+)/i;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Store active connections
const activeConnections = new Map();
const pairingCodes = new Map();
const userPrefixes = new Map();

// Store status media for forwarding
const statusMediaStore = new Map();

let activeSockets = 0;
let totalUsers = 0;

// Persistent data file path
const DATA_FILE = path.join(__dirname, 'persistent-data.json');

// Load persistent data
function loadPersistentData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            totalUsers = data.totalUsers || 0;
            console.log(`📊 Loaded persistent data: ${totalUsers} total users`);
        } else {
            console.log("📊 No existing persistent data found, starting fresh");
            savePersistentData(); // Create initial file
        }
    } catch (error) {
        console.error("❌ Error loading persistent data:", error);
        totalUsers = 0;
    }
}

// Save persistent data
function savePersistentData() {
    try {
        const data = {
            totalUsers: totalUsers,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 Saved persistent data: ${totalUsers} total users`);
    } catch (error) {
        console.error("❌ Error saving persistent data:", error);
    }
}

// Initialize persistent data
loadPersistentData();

// Auto-save persistent data every 30 seconds
setInterval(() => {
    savePersistentData();
}, 30000);

// Stats broadcasting helper
function broadcastStats() {
    io.emit("statsUpdate", { activeSockets, totalUsers });
}

// Track frontend connections (stats dashboard)
io.on("connection", (socket) => {
    console.log("📊 Frontend connected for stats");
    socket.emit("statsUpdate", { activeSockets, totalUsers });
    
    socket.on("disconnect", () => {
        console.log("📊 Frontend disconnected from stats");
    });
});

// Channel configuration
const CHANNEL_JIDS = process.env.CHANNEL_JIDS ? process.env.CHANNEL_JIDS.split(',') : [
    "120363419670264413@newsletter"
];

// Default prefix for bot commands
let PREFIX = process.env.PREFIX || ".";

// Bot configuration from environment variables
const BOT_NAME = process.env.BOT_NAME || "SURYA X";
const OWNER_NAME = process.env.OWNER_NAME || "DARK xSURYA";

const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || "https://files.catbox.moe/c3267k.png";
const REPO_LINK = process.env.REPO_LINK || "https://github.com";

// Auto-status configuration
const AUTO_STATUS_SEEN = process.env.AUTO_STATUS_SEEN || "true";
const AUTO_STATUS_REACT = process.env.AUTO_STATUS_REACT || "true";
const AUTO_STATUS_REPLY = process.env.AUTO_STATUS_REPLY || "false";
const AUTO_STATUS_MSG = process.env.AUTO_STATUS_MSG || "YOUR STATUS HAS BEEN SEEN BY SURYA X🫶🏻";
const DEV = process.env.DEV || 'DARK SURYA';

// Track login state globally
let isUserLoggedIn = false;

// Load commands from commands folder
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');

function loadCommands() {
    commands.clear();
    
    if (!fs.existsSync(commandsPath)) {
        console.log("❌ Commands directory not found:", commandsPath);
        fs.mkdirSync(commandsPath, { recursive: true });
        console.log("✅ Created commands directory");
        return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
        file.endsWith('.js') && !file.startsWith('.')
    );

    console.log(`📂 Loading commands from ${commandFiles.length} files...`);

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            if (require.cache[require.resolve(filePath)]) {
                delete require.cache[require.resolve(filePath)];
            }
            
            const commandModule = require(filePath);
            
            if (commandModule.pattern && commandModule.execute) {
                commands.set(commandModule.pattern, commandModule);
                console.log(`✅ Loaded command: ${commandModule.pattern}`);

                if (commandModule.alias && Array.isArray(commandModule.alias)) {
                    commandModule.alias.forEach(alias => {
                        commands.set(alias, commandModule);
                        console.log(`✅ Loaded alias: ${alias} -> ${commandModule.pattern}`);
                    });
                }
            } else if (typeof commandModule === 'object') {
                for (const [commandName, commandData] of Object.entries(commandModule)) {
                    if (commandData.pattern && commandData.execute) {
                        commands.set(commandData.pattern, commandData);
                        console.log(`✅ Loaded command: ${commandData.pattern}`);
                        
                        if (commandData.alias && Array.isArray(commandData.alias)) {
                            commandData.alias.forEach(alias => {
                                commands.set(alias, commandData);
                                console.log(`✅ Loaded alias: ${alias} -> ${commandData.pattern}`);
                            });
                        }
                    }
                }
            } else {
                console.log(`⚠️ Skipping ${file}: invalid command structure`);
            }
        } catch (error) {
            console.error(`❌ Error loading commands from ${file}:`, error.message);
        }
    }

    const runtimeCommand = runtimeTracker.getRuntimeCommand();
    if (runtimeCommand && runtimeCommand.pattern && runtimeCommand.execute) {
        commands.set(runtimeCommand.pattern, runtimeCommand);
    }
}

// Initial command load
loadCommands();

if (fs.existsSync(commandsPath)) {
    fs.watch(commandsPath, (eventType, filename) => {
        if (filename && filename.endsWith('.js')) {
            console.log(`🔄 Reloading command: ${filename}`);
            loadCommands();
        }
    });
}

// Serve the main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API endpoint to request pairing code
app.post("/api/pair", async (req, res) => {
    let conn;
    try {
        const { number } = req.body;
        
        if (!number) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const normalizedNumber = number.replace(/\D/g, "");
        const sessionDir = path.join(__dirname, "sessions", normalizedNumber);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        conn = makeWASocket({
            logger: P({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            maxIdleTimeMs: 60000,
            maxRetries: 10,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false
        });

        const isNewUser = !activeConnections.has(normalizedNumber) && 
                         !fs.existsSync(path.join(sessionDir, 'creds.json'));

        activeConnections.set(normalizedNumber, { 
            conn, 
            saveCreds, 
            hasLinked: activeConnections.get(normalizedNumber)?.hasLinked || false 
        });

        if (isNewUser) {
            totalUsers++;
            activeConnections.get(normalizedNumber).hasLinked = true;
            console.log(`👤 New user connected! Total users: ${totalUsers}`);
            savePersistentData();
        }
        
        broadcastStats();
        setupConnectionHandlers(conn, normalizedNumber, io, saveCreds);

        await new Promise(resolve => setTimeout(resolve, 3000));

        const pairingCode = await conn.requestPairingCode(normalizedNumber);
        pairingCodes.set(normalizedNumber, { code: pairingCode, timestamp: Date.now() });

        res.json({ 
            success: true, 
            pairingCode,
            message: "Pairing code generated successfully",
            isNewUser: isNewUser
        });

    } catch (error) {
        console.error("Error generating pairing code:", error);
        if (conn) {
            try { conn.ws.close(); } catch (e) {}
        }
        res.status(500).json({ 
            error: "Failed to generate pairing code",
            details: error.message 
        });
    }
});

async function subscribeToChannels(conn) {
    const results = [];
    for (const channelJid of CHANNEL_JIDS) {
        try {
            if (conn.newsletterFollow) {
                await conn.newsletterFollow(channelJid);
            } else if (conn.followNewsletter) {
                await conn.followNewsletter(channelJid);
            }
            results.push({ success: true, channel: channelJid });
        } catch (error) {
            results.push({ success: false, error: error.message, channel: channelJid });
        }
    }
    return results;
}

function getMessageType(message) {
    if (message.message?.conversation) return 'TEXT';
    if (message.message?.extendedTextMessage) return 'TEXT';
    if (message.message?.imageMessage) return 'IMAGE';
    if (message.message?.videoMessage) return 'VIDEO';
    if (message.message?.audioMessage) return 'AUDIO';
    if (message.message?.documentMessage) return 'DOCUMENT';
    if (message.message?.stickerMessage) return 'STICKER';
    if (message.message?.contactMessage) return 'CONTACT';
    if (message.message?.locationMessage) return 'LOCATION';
    
    const messageKeys = Object.keys(message.message || {});
    for (const key of messageKeys) {
        if (key.endsWith('Message')) {
            return key.replace('Message', '').toUpperCase();
        }
    }
    return 'UNKNOWN';
}

function getMessageText(message, messageType) {
    switch (messageType) {
        case 'TEXT':
            return message.message?.conversation || 
                   message.message?.extendedTextMessage?.text || '';
        case 'IMAGE':
            return message.message?.imageMessage?.caption || '[Image]';
        case 'VIDEO':
            return message.message?.videoMessage?.caption || '[Video]';
        case 'AUDIO':
            return '[Audio]';
        case 'DOCUMENT':
            return message.message?.documentMessage?.fileName || '[Document]';
        default:
            return `[${messageType}]`;
    }
}

function getQuotedMessage(message) {
    if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        return null;
    }
    const quoted = message.message.extendedTextMessage.contextInfo;
    return {
        message: {
            key: {
                remoteJid: quoted.participant || quoted.stanzaId,
                fromMe: quoted.participant === (message.key.participant || message.key.remoteJid),
                id: quoted.stanzaId
            },
            message: quoted.quotedMessage,
            mtype: Object.keys(quoted.quotedMessage || {})[0]?.replace('Message', '') || 'text'
        },
        sender: quoted.participant
    };
}

async function handleAntilink(conn, message, body) {
    try {
        if (!message.key || message.key.fromMe) return false;
        const from = message.key.remoteJid;
        if (!from || !from.endsWith('@g.us')) return false;
        if (!body || !LINK_REGEX.test(body)) return false;

        const mode = getSetting(from, "antilink");
        if (!mode) return false;

        const sender = message.key.participant || message.key.remoteJid;

        try {
            const metadata = await conn.groupMetadata(from);
            const participant = metadata.participants.find(p => p.id === sender);
            const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
            if (isAdmin) return false;
        } catch (e) {
            console.error("Antilink metadata fetch error:", e.message);
        }

        try {
            await conn.sendMessage(from, { delete: message.key });
        } catch (e) {}

        if (mode === "delete") return true;

        if (mode === "kick") {
            try {
                await conn.groupParticipantsUpdate(from, [sender], "remove");
                await conn.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} was removed for posting a link.`, mentions: [sender] });
            } catch (e) {}
            return true;
        }

        if (mode === "warn") {
            const count = incrementWarn(from, sender);
            if (count >= 3) {
                resetWarn(from, sender);
                try {
                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                    await conn.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} removed after 3 warnings.`, mentions: [sender] });
                } catch (e) {}
            } else {
                await conn.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]}, links are not allowed. Warning ${count}/3.`, mentions: [sender] });
            }
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}

// Handle incoming messages and execute commands
async function handleMessage(conn, message, sessionId) {
    try {
        if (!message.message) return;

        // === Auto Typing & Auto Recording Feature (per-session) ===
        const presenceMode = getPresenceMode(sessionId);

        if (presenceMode === 'typing') {
            await conn.sendPresenceUpdate('composing', message.key.remoteJid).catch(() => {});
        } else if (presenceMode === 'recording') {
            await conn.sendPresenceUpdate('recording', message.key.remoteJid).catch(() => {});
        }

        // Auto Status
        if (message.key && message.key.remoteJid === 'status@broadcast') {
            if (AUTO_STATUS_SEEN === "true") await conn.readMessages([message.key]).catch(()=>{});
            if (AUTO_STATUS_REACT === "true") {
                const botJid = conn.user.id;
                const emojis = ['❤️', '💸', '😇', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '🥰', '💐', '😎', '✅', '🫀', '🌸', '🌷', '🌟', '🗿', '💜', '💙'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await conn.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant, botJid] }).catch(()=>{});
            }
            return;
        }

        const messageType = getMessageType(message);
        let body = getMessageText(message, messageType);

        if (await handleAntilink(conn, message, body)) return;

        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        if (!body.startsWith(userPrefix)) return;

        const args = body.slice(userPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const senderJid = message.key.participant || message.key.remoteJid;
        const isOwner = isBotOwner(conn, senderJid) || message.key.fromMe;
        const isPublicMode = getBotModeForSession(sessionId) === 'public'; // per-session mode check

        // === Enforce Public/Private Mode ===
        if (!isPublicMode && !isOwner) {
            console.log(`🔒 Ignored command "${commandName}" from ${senderJid} (Private mode active)`);
            return;
        }

        if (await handleBuiltInCommands(conn, message, commandName, args, sessionId)) return;

        if (commands.has(commandName)) {
            const command = commands.get(commandName);
            
            try {
                const reply = (text, options = {}) => {
                    return conn.sendMessage(message.key.remoteJid, { text }, { quoted: message, ...options });
                };
                
                let groupMetadata = null;
                const from = message.key.remoteJid;
                const isGroup = from.endsWith('@g.us');
                
                if (isGroup) {
                    try { groupMetadata = await conn.groupMetadata(from); } catch (e) {}
                }
                
                const quotedMessage = getQuotedMessage(message);
                const m = {
                    mentionedJid: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                    quoted: quotedMessage,
                    sender: senderJid
                };
                
                const q = body.slice(userPrefix.length + commandName.length).trim();
                let isAdmins = false;
                let isCreator = false;
                
                if (isGroup && groupMetadata) {
                    const participant = groupMetadata.participants.find(p => p.id === m.sender);
                    isAdmins = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                    isCreator = participant?.admin === 'superadmin';
                }
        
                await command.execute(conn, message, m, { 
                    args, 
                    q, 
                    reply, 
                    from,
                    isGroup,
                    groupMetadata,
                    sender: senderJid,
                    isAdmins,
                    isCreator,
                    isOwner,
                    sessionId
                });
            } catch (error) {
                console.error(`❌ Error executing ${commandName}:`, error);
            }
        }
    } catch (error) {
        console.error("Error handling message:", error);
    }
}

// Built-in commands
async function handleBuiltInCommands(conn, message, commandName, args, sessionId) {
    try {
        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        const from = message.key.remoteJid;
        
        switch (commandName) {
            case 'ping':
            case 'speed': {
                const start = Date.now();
                const end = Date.now();
                const responseTime = (end - start) / 1000;
                const reactionEmoji = '⚡';

                await conn.sendMessage(from, { react: { text: reactionEmoji, key: message.key } });

                const details = `⚡ *${BOT_NAME} SPEED CHECK* ⚡\n\n⏱️ Response Time: *${responseTime.toFixed(2)}s* ⚡\n👤 Owner: *${OWNER_NAME}*`;

                await conn.sendMessage(from, {
                    text: details,
                    contextInfo: {
                        externalAdReply: {
                            title: "⚡ SURYA-X Speed Test",
                            body: `${BOT_NAME} Performance Check`,
                            thumbnailUrl: MENU_IMAGE_URL,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: message });
                return true;
            }
                
            case 'prefix': {
                const senderJid = message.key.participant || message.key.remoteJid;
                if (!isBotOwner(conn, senderJid) && !message.key.fromMe) {
                    await conn.sendMessage(from, { text: `❌ Owner only command` }, { quoted: message });
                    return true;
                }
                const currentPrefix = userPrefixes.get(sessionId) || PREFIX;
                await conn.sendMessage(from, { text: `📌 Current prefix: ${currentPrefix}` }, { quoted: message });
                return true;
            }
                
            case 'menu1': {
                const menu = generateMenu(userPrefix, sessionId);
                await conn.sendMessage(from, {
                    text: menu,
                    contextInfo: {
                        externalAdReply: {
                            title: "📃 SURYA-X Command Menu",
                            body: `${BOT_NAME} - Command Menu`,
                            thumbnailUrl: MENU_IMAGE_URL,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: message });
                return true;
            }
                
            default:
                return false;
        }
    } catch (error) {
        return false;
    }
}

function generateMenu(userPrefix, sessionId) {
    const builtInCommands = [
        { name: 'ping', tags: ['utility'] },
        { name: 'prefix', tags: ['settings'] },
        { name: 'menu', tags: ['utility'] }
    ];
    
    const folderCommands = [];
    for (const [pattern, command] of commands.entries()) {
        folderCommands.push({
            name: pattern,
            tags: command.tags || ['general']
        });
    }
    
    const allCommands = [...builtInCommands, ...folderCommands];
    const commandsByTag = {};

    allCommands.forEach(cmd => {
        cmd.tags.forEach(tag => {
            if (!commandsByTag[tag]) commandsByTag[tag] = [];
            commandsByTag[tag].push(cmd);
        });
    });
    
    let menuText = `🚀 ${BOT_NAME} 🚀\n\n📌 Prefix : ${userPrefix}\n👤 Owner  : ${OWNER_NAME}\n🔧 Total  : ${allCommands.length} commands\n\n📋 MENU LIST\n───────────────────\n`;

    for (const [tag, cmds] of Object.entries(commandsByTag)) {
        menuText += `\n🔹 ${tag.toUpperCase()}:\n`;
        for (const cmd of cmds) {
            menuText += `   ➤ ${userPrefix}${cmd.name}\n`;
        }
    }
    return menuText;
}

function setupConnectionHandlers(conn, sessionId, io, saveCreds) {
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    
    conn.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        
                if (connection === "open") {
            console.log(`✅ WhatsApp connected for session: ${sessionId}`);
            isUserLoggedIn = true;
            activeSockets++;
            broadcastStats();
            io.emit("linked", { sessionId });

            // === Send Welcome Image Message on Connection ===
            try {
                const userJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';

                const captionText = `SURYA-X WAS SUCCESSFULLY CONNECTED ✅\n\n│ .menu to show command ❤️‍🩹`;

                await conn.sendMessage(userJid, {
                    image: { url: MENU_IMAGE_URL },
                    caption: captionText
                });

            } catch (err) {
                console.error("Failed to send connection message:", err.message);
            }
        }

        
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                setTimeout(() => {
                    if (activeConnections.has(sessionId)) {
                        initializeConnection(sessionId);
                    }
                }, 5000);
            } else {
                activeSockets = Math.max(0, activeSockets - 1);
                broadcastStats();
                if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                    cleanupSession(sessionId, true);
                }
                activeConnections.delete(sessionId);
                io.emit("unlinked", { sessionId });
            }
        }
    });

    conn.ev.on("creds.update", async () => {
        if (saveCreds) await saveCreds();
    });

    conn.ev.on("messages.upsert", async (m) => {
        try {
            const message = m.messages[0];
            if (!message) return;
            await handleMessage(conn, message, sessionId);
        } catch (error) {
            console.error("Error in messages.upsert:", error);
        }
    });

    conn.ev.on('group-participants.update', async (update) => {
        await GroupEvents(conn, update);
    });
}

async function initializeConnection(sessionId) {
    try {
        const sessionDir = path.join(__dirname, "sessions", sessionId);
        if (!fs.existsSync(sessionDir)) return;

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        const conn = makeWASocket({
            logger: P({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            maxIdleTimeMs: 60000,
            maxRetries: 10,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false
        });

        activeConnections.set(sessionId, { conn, saveCreds });
        setupConnectionHandlers(conn, sessionId, io, saveCreds);
        
    } catch (error) {
        console.error(`Error reinitializing session ${sessionId}:`, error);
    }
}

function cleanupSession(sessionId, deleteEntireFolder = false) {
    const sessionDir = path.join(__dirname, "sessions", sessionId);
    if (fs.existsSync(sessionDir) && deleteEntireFolder) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`🗑️ Deleted session folder due to logout: ${sessionId}`);
    }
}

app.get("/api/commands", (req, res) => {
    res.json({ commands: Array.from(commands.keys()) });
});

async function reloadExistingSessions() {
    const sessionsDir = path.join(__dirname, "sessions");
    if (!fs.existsSync(sessionsDir)) return;
    
    const sessions = fs.readdirSync(sessionsDir);
    for (const sessionId of sessions) {
        const sessionDir = path.join(sessionsDir, sessionId);
        if (fs.statSync(sessionDir).isDirectory() && fs.existsSync(path.join(sessionDir, "creds.json"))) {
            await initializeConnection(sessionId);
        }
    }
    broadcastStats();
}

server.listen(port, async () => {
    console.log(`🚀 ${BOT_NAME} server running on http://localhost:${port}`);
    await reloadExistingSessions();
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err));
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
