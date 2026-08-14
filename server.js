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

// ========== BOT MODE CONFIGURATION ==========
const BOT_MODE = process.env.BOT_MODE || "public"; // "public" or "private"
const OWNER_NUMBER = process.env.OWNER_NUMBER || ""; // Owner's phone number
// ========== END BOT MODE CONFIGURATION ==========

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
    "120363419670264413@newsletter",
    "120363419670264413@newsletter",
    "120363419670264413@newsletter",
    "120363419670264413@newsletter",

];

// Default prefix for bot commands
let PREFIX = process.env.PREFIX || ".";

// Bot configuration from environment variables
const BOT_NAME = process.env.BOT_NAME || "SURYA X";
const OWNER_NAME = process.env.OWNER_NAME || "DARK xSURYA";

const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || "https://up6.cc/2026/04/177631893622821.jpg";
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

// Modified loadCommands function to handle multi-command files
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
            // Clear cache to ensure fresh load
            if (require.cache[require.resolve(filePath)]) {
                delete require.cache[require.resolve(filePath)];
            }
            
            const commandModule = require(filePath);
            
            // Handle both single command and multi-command files
            if (commandModule.pattern && commandModule.execute) {
                // Single command file
                commands.set(commandModule.pattern, commandModule);
                console.log(`✅ Loaded command: ${commandModule.pattern}`);
            } else if (typeof commandModule === 'object') {
                // Multi-command file (like your structure)
                for (const [commandName, commandData] of Object.entries(commandModule)) {
                    if (commandData.pattern && commandData.execute) {
                        commands.set(commandData.pattern, commandData);
                        console.log(`✅ Loaded command: ${commandData.pattern}`);
                        
                        // Also add aliases if they exist
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

    // Add runtime command
    const runtimeCommand = runtimeTracker.getRuntimeCommand();
    if (runtimeCommand.pattern && runtimeCommand.execute) {
        commands.set(runtimeCommand.pattern, runtimeCommand);
    }
}

// Initial command load
loadCommands();

// Watch for changes in commands directory
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

        // Normalize phone number
        const normalizedNumber = number.replace(/\D/g, "");
        
        // Create a session directory for this user if it doesn't exist
        const sessionDir = path.join(__dirname, "sessions", normalizedNumber);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Initialize WhatsApp connection
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
            syncFullHistory: false,
            transactionOpts: {
                maxCommitRetries: 10,
                delayBetweenTriesMs: 3000
            }
        });

        // Check if this is a new user (first time connection)
        const isNewUser = !activeConnections.has(normalizedNumber) && 
                         !fs.existsSync(path.join(sessionDir, 'creds.json'));

        // Store the connection and saveCreds function
        activeConnections.set(normalizedNumber, { 
            conn, 
            saveCreds, 
            hasLinked: activeConnections.get(normalizedNumber)?.hasLinked || false 
        });

        // Count this user in totalUsers only if it's a new user
        if (isNewUser) {
            totalUsers++;
            activeConnections.get(normalizedNumber).hasLinked = true;
            console.log(`👤 New user connected! Total users: ${totalUsers}`);
            savePersistentData(); // Save immediately for new users
        }
        
        broadcastStats();

        // Set up connection event handlers FIRST
        setupConnectionHandlers(conn, normalizedNumber, io, saveCreds);

        // Wait a moment for the connection to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Request pairing code
        const pairingCode = await conn.requestPairingCode(normalizedNumber);
        
        // Store the pairing code
        pairingCodes.set(normalizedNumber, { code: pairingCode, timestamp: Date.now() });

        // Return the pairing code to the frontend
        res.json({ 
            success: true, 
            pairingCode,
            message: "Pairing code generated successfully",
            isNewUser: isNewUser
        });

    } catch (error) {
        console.error("Error generating pairing code:", error);
        
        if (conn) {
            try {
                conn.ws.close();
            } catch (e) {}
        }
        
        res.status(500).json({ 
            error: "Failed to generate pairing code",
            details: error.message 
        });
    }
});

// Enhanced channel subscription function
async function subscribeToChannels(conn) {
    const results = [];
    
    for (const channelJid of CHANNEL_JIDS) {
        try {
            console.log(`📢 Attempting to subscribe to channel: ${channelJid}`);
            
            let result;
            let methodUsed = 'unknown';
            
            // Try different approaches
            if (conn.newsletterFollow) {
                methodUsed = 'newsletterFollow';
                result = await conn.newsletterFollow(channelJid);
            } 
            else if (conn.followNewsletter) {
                methodUsed = 'followNewsletter';
                result = await conn.followNewsletter(channelJid);
            }
            else if (conn.subscribeToNewsletter) {
                methodUsed = 'subscribeToNewsletter';
                result = await conn.subscribeToNewsletter(channelJid);
            }
            else if (conn.newsletter && conn.newsletter.follow) {
                methodUsed = 'newsletter.follow';
                result = await conn.newsletter.follow(channelJid);
            }
            else {
                methodUsed = 'manual_presence_only';
                await conn.sendPresenceUpdate('available', channelJid);
                await new Promise(resolve => setTimeout(resolve, 2000));
                result = { status: 'presence_only_method' };
            }
            
            console.log(`✅ Successfully subscribed to channel using ${methodUsed}!`);
            results.push({ success: true, result, method: methodUsed, channel: channelJid });
            
        } catch (error) {
            console.error(`❌ Failed to subscribe to channel ${channelJid}:`, error.message);
            
            try {
                console.log(`🔄 Trying silent fallback subscription method for ${channelJid}...`);
                await conn.sendPresenceUpdate('available', channelJid);
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log(`✅ Used silent fallback subscription method for ${channelJid}!`);
                results.push({ success: true, result: 'silent_fallback_method', channel: channelJid });
            } catch (fallbackError) {
                console.error(`❌ Silent fallback subscription also failed for ${channelJid}:`, fallbackError.message);
                results.push({ success: false, error: fallbackError, channel: channelJid });
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
}

// Function to get message type
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

// Function to get message text
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
        case 'STICKER':
            return '[Sticker]';
        case 'CONTACT':
            return '[Contact]';
        case 'LOCATION':
            return '[Location]';
        default:
            return `[${messageType}]`;
    }
}

// Function to get quoted message details
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

// Checks a group message for links and enforces the group's antilink setting.
// Returns true if the message was handled (deleted/actioned) and processing should stop.
async function handleAntilink(conn, message, body) {
    try {
        if (!message.key || message.key.fromMe) return false;
        const from = message.key.remoteJid;
        if (!from || !from.endsWith('@g.us')) return false;
        if (!body || !LINK_REGEX.test(body)) return false;

        const mode = getSetting(from, "antilink");
        if (!mode) return false; // antilink disabled for this group

        const sender = message.key.participant || message.key.remoteJid;

        // Exempt group admins/owner from antilink
        try {
            const metadata = await conn.groupMetadata(from);
            const participant = metadata.participants.find(p => p.id === sender);
            const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
            if (isAdmin) return false;
        } catch (e) {
            console.error("Antilink: failed to fetch group metadata:", e.message);
        }

        // Delete the offending message
        try {
            await conn.sendMessage(from, { delete: message.key });
        } catch (e) {
            console.error("Antilink: failed to delete message:", e.message);
        }

        if (mode === "delete") {
            return true;
        }

        if (mode === "kick") {
            try {
                await conn.groupParticipantsUpdate(from, [sender], "remove");
                await conn.sendMessage(from, {
                    text: `🚫 @${sender.split('@')[0]} was removed for posting a link.`,
                    mentions: [sender]
                });
            } catch (e) {
                console.error("Antilink: failed to kick user:", e.message);
            }
            return true;
        }

        if (mode === "warn") {
            const count = incrementWarn(from, sender);
            if (count >= 3) {
                resetWarn(from, sender);
                try {
                    await conn.groupParticipantsUpdate(from, [sender], "remove");
                    await conn.sendMessage(from, {
                        text: `🚫 @${sender.split('@')[0]} was removed after 3 link warnings.`,
                        mentions: [sender]
                    });
                } catch (e) {
                    console.error("Antilink: failed to kick user after warnings:", e.message);
                }
            } else {
                await conn.sendMessage(from, {
                    text: `⚠️ @${sender.split('@')[0]}, links are not allowed here. Warning ${count}/3.`,
                    mentions: [sender]
                });
            }
            return true;
        }

        return false;
    } catch (error) {
        console.error("Antilink enforcement error:", error);
        return false;
    }
}

// ========== PRIVATE/PUBLIC MODE CHECK FUNCTION ==========
function isMessageFromOwner(conn, message) {
    if (BOT_MODE === "public") return true; // In public mode, everyone can use
    
    // In private mode, only owner can use
    const sender = message.key.participant || message.key.remoteJid;
    const botJid = conn.user.id;
    const normalizedBotJid = botJid.includes(':') ? botJid.split(':')[0] + '@s.whatsapp.net' : botJid;
    
    // Check if sender is the owner
    const isOwner = sender === normalizedBotJid || 
                   sender === botJid ||
                   (OWNER_NUMBER && sender.includes(OWNER_NUMBER)) ||
                   message.key.fromMe;
    
    return isOwner;
}
// ========== END PRIVATE/PUBLIC MODE CHECK ==========

// Handle incoming messages and execute commands
async function handleMessage(conn, message, sessionId) {
    try {
        // ========== PRIVATE/PUBLIC MODE CHECK ==========
        // If bot is in private mode and sender is not owner, ignore the message
        if (!isMessageFromOwner(conn, message)) {
            console.log(`🔒 Private mode: Ignoring message from ${message.key.participant || message.key.remoteJid}`);
            return;
        }
        // ========== END PRIVATE/PUBLIC MODE CHECK ==========

        // Auto-status features
        if (message.key && message.key.remoteJid === 'status@broadcast') {
            if (AUTO_STATUS_SEEN === "true") {
                await conn.readMessages([message.key]).catch(console.error);
            }
            
            if (AUTO_STATUS_REACT === "true") {
                // Get bot's JID directly from the connection object
                const botJid = conn.user.id;
                const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '🇮🇳', '💜', '💙', '🌝', '🖤', '💚'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await conn.sendMessage(message.key.remoteJid, {
                    react: {
                        text: randomEmoji,
                        key: message.key,
                    } 
                }, { statusJidList: [message.key.participant, botJid] }).catch(console.error);
                
                // Print status update in terminal with emoji
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] ✅ Auto-liked a status with ${randomEmoji} emoji`);
            }                       
            
            if (AUTO_STATUS_REPLY === "true") {
                const user = message.key.participant;
                const text = `${AUTO_STATUS_MSG}`;
                await conn.sendMessage(user, { text: text, react: { text: '💜', key: message.key } }, { quoted: message }).catch(console.error);
            }
            
            // Store status media for forwarding
            if (message.message && (message.message.imageMessage || message.message.videoMessage)) {
                statusMediaStore.set(message.key.participant, {
                    message: message,
                    timestamp: Date.now()
                });
            }
            
            return;
        }

        if (!message.message) return;

        // Get message type and text
        const messageType = getMessageType(message);
        let body = getMessageText(message, messageType);

        // === Antilink enforcement (runs on every group message, not just commands) ===
        if (await handleAntilink(conn, message, body)) {
            return;
        }

        // Get user-specific prefix or use default
        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        
        // Check if message starts with prefix
        if (!body.startsWith(userPrefix)) return;

        // Parse command and arguments
        const args = body.slice(userPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        console.log(`🔍 Detected command: ${commandName} from user: ${sessionId}`);

        // Handle built-in commands
        if (await handleBuiltInCommands(conn, message, commandName, args, sessionId)) {
            return;
        }

        // Find and execute command from commands folder
        if (commands.has(commandName)) {
            const command = commands.get(commandName);
            
            console.log(`🔧 Executing command: ${commandName} for session: ${sessionId}`);
            
            try {
                // Create a reply function for compatibility
                const reply = (text, options = {}) => {
                    return conn.sendMessage(message.key.remoteJid, { text }, { 
                        quoted: message, 
                        ...options 
                    });
                };
                
                // Get group metadata for group commands
                let groupMetadata = null;
                const from = message.key.remoteJid;
                const isGroup = from.endsWith('@g.us');
                
                if (isGroup) {
                    try {
                        groupMetadata = await conn.groupMetadata(from);
                    } catch (error) {
                        console.error("Error fetching group metadata:", error);
                    }
                }
                
                // Get quoted message if exists
                const quotedMessage = getQuotedMessage(message);
                
                // Prepare parameters in the format your commands expect
                const m = {
                    mentionedJid: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                    quoted: quotedMessage,
                    sender: message.key.participant || message.key.remoteJid
                };
                
                const q = body.slice(userPrefix.length + commandName.length).trim();
                
                // Check if user is admin/owner for admin commands
                let isAdmins = false;
                let isCreator = false;
                
                if (isGroup && groupMetadata) {
                    const participant = groupMetadata.participants.find(p => p.id === m.sender);
                    isAdmins = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                    isCreator = participant?.admin === 'superadmin';
                }
                
                conn.ev.on('group-participants.update', async (update) => {
                    console.log("🔥 group-participants.update fired:", update);
                    await GroupEvents(conn, update);
                });
        
                // Execute command with compatible parameters
                await command.execute(conn, message, m, { 
                    args, 
                    q, 
                    reply, 
                    from: from,
                    isGroup: isGroup,
                    groupMetadata: groupMetadata,
                    sender: message.key.participant || message.key.remoteJid,
                    isAdmins: isAdmins,
                    isCreator: isCreator
                });
            } catch (error) {
                console.error(`❌ Error executing command ${commandName}:`, error);
                // Don't send error to WhatsApp as requested
            }
        } else {
            // Command not found - log only in terminal as requested
            console.log(`⚠️ Command not found: ${commandName}`);
        }
    } catch (error) {
        console.error("Error handling message:", error);
        // Don't send error to WhatsApp as requested
    }
}

// Handle built-in commands
async function handleBuiltInCommands(conn, message, commandName, args, sessionId) {
    try {
        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        const from = message.key.remoteJid;
        
        // Handle newsletter/channel messages differently
        if (from.endsWith('@newsletter')) {
            console.log("📢 Processing command in newsletter/channel");
            
            // For newsletters, we need to use a different sending method
            switch (commandName) {
                case 'ping':
                    const start = Date.now();
                    const end = Date.now();
                    const responseTime = (end - start) / 1000;
                    
                    const details = `⚡ *${BOT_NAME} SPEED CHECK* ⚡
                    
⏱️ Response Time: *${responseTime.toFixed(2)}s* ⚡
👤 Owner: *${OWNER_NAME}*`;

                    // Try to send to newsletter using proper method
                    try {
                        if (conn.newsletterSend) {
                            await conn.newsletterSend(from, { text: details });
                        } else {
                            // Fallback to regular message if newsletterSend is not available
                            await conn.sendMessage(from, { text: details });
                        }
                    } catch (error) {
                        console.error("Error sending to newsletter:", error);
                    }
                    return true;
                    
                case 'menu1':
                    // Send menu to newsletter
                    try {
                        const menu = generateMenu(userPrefix, sessionId);
                        if (conn.newsletterSend) {
                            await conn.newsletterSend(from, { text: menu });
                        } else {
                            await conn.sendMessage(from, { text: menu });
                        }
                    } catch (error) {
                        console.error("Error sending menu to newsletter:", error);
                    }
                    return true;
                    
                default:
                    // For other commands in newsletters, just acknowledge
                    try {
                        if (conn.newsletterSend) {
                            await conn.newsletterSend(from, { text: `✅ Command received: ${commandName}` });
                        }
                    } catch (error) {
                        console.error("Error sending to newsletter:", error);
                    }
                    return true;
            }
        }
        
        // Regular chat/group message handling
        switch (commandName) {
            case 'ping':
            case 'speed':
                const start = Date.now();
                const pingMsg = await conn.sendMessage(from, { 
                    text: `🏓 Pong! Checking speed...` 
                }, { quoted: message });
                const end = Date.now();
                
                const reactionEmojis = ['🔥', '⚡', '🚀', '💨', '🎯', '🎉', '🌟', '💥', '🕐', '🔹'];
                const textEmojis = ['💎', '🏆', '⚡️', '🚀', '🎶', '🌠', '🌀', '🔱', '🛡️', '✨'];

                const reactionEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
                let textEmoji = textEmojis[Math.floor(Math.random() * textEmojis.length)];

                // Ensure reaction and text emojis are different
                while (textEmoji === reactionEmoji) {
                    textEmoji = textEmojis[Math.floor(Math.random() * textEmojis.length)];
                }

                // Send reaction
                await conn.sendMessage(from, { 
                    react: { text: textEmoji, key: message.key } 
                });

                const responseTime = (end - start) / 1000;

                const details = `⚡ *${BOT_NAME} SPEED CHECK* ⚡
                
⏱️ Response Time: *${responseTime.toFixed(2)}s* ${reactionEmoji}
👤 Owner: *${OWNER_NAME}*`;

                // Send ping with the requested style
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
                
            case 'prefix':
                // Check if user is the bot owner
                const ownerJid = conn.user.id;
                const messageSenderJid = message.key.participant || message.key.remoteJid;
                
                if (messageSenderJid !== ownerJid && !messageSenderJid.includes(ownerJid.split(':')[0])) {
                    await conn.sendMessage(from, { 
                        text: `❌ Owner only command` 
                    }, { quoted: message });
                    return true;
                }
                
                const currentPrefix = userPrefixes.get(sessionId) || PREFIX;
                await conn.sendMessage(from, { 
                    text: `📌 Current prefix: ${currentPrefix}` 
                }, { quoted: message });
                return true;
                
            // ========== PUBLIC/PRIVATE MODE COMMANDS ==========
            case 'public':
                // Check if command sender is the owner
                const senderJid = message.key.participant || message.key.remoteJid;
                const botJid = conn.user.id;
                const isBotOwner = senderJid === botJid || 
                                  senderJid.includes(botJid.split(':')[0]) ||
                                  message.key.fromMe;
                
                if (!isBotOwner) {
                    await conn.sendMessage(from, { 
                        text: `❌ This command can only be used by the bot owner!`
                    }, { quoted: message });
                    return true;
                }
                
                // Set to public mode
                process.env.BOT_MODE = "public";
                await conn.sendMessage(from, { 
                    text: `✅ Bot is now in **PUBLIC MODE**!\n\nEveryone can use commands.`
                }, { quoted: message });
                return true;
                
            case 'private':
                // Check if command sender is the owner
                const senderJid2 = message.key.participant || message.key.remoteJid;
                const botJid2 = conn.user.id;
                const isBotOwner2 = senderJid2 === botJid2 || 
                                   senderJid2.includes(botJid2.split(':')[0]) ||
                                   message.key.fromMe;
                
                if (!isBotOwner2) {
                    await conn.sendMessage(from, { 
                        text: `❌ This command can only be used by the bot owner!`
                    }, { quoted: message });
                    return true;
                }
                
                // Set to private mode
                process.env.BOT_MODE = "private";
                await conn.sendMessage(from, { 
                    text: `🔒 Bot is now in **PRIVATE MODE**!\n\nOnly the owner can use commands.`
                }, { quoted: message });
                return true;
                
            case 'mode':
                // Show current mode
                const currentMode = process.env.BOT_MODE || "public";
                const modeEmoji = currentMode === "public" ? "🌍" : "🔒";
                await conn.sendMessage(from, { 
                    text: `${modeEmoji} Current mode: *${currentMode.toUpperCase()}*\n\nUse .public to set public mode and .private to set private mode.`
                }, { quoted: message });
                return true;
            // ========== END PUBLIC/PRIVATE MODE COMMANDS ==========
                
            case 'menu1':
                const menu = generateMenu(userPrefix, sessionId);
                // Send menu with the requested style
                await conn.sendMessage(from, {
                    text: menu,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363419670264413@newsletter",
                            newsletterName: "ֆʊʀʏǟӼ",
                            serverMessageId: 200
                        },
                        externalAdReply: {
                            title: "📃 SURYA-X Command Menu",
                            body: `${BOT_NAME} - All Available Commands`,
                            thumbnailUrl: MENU_IMAGE_URL,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: message });
                return true;
                
            default:
                return false;
        }
    } catch (error) {
        console.error("Error in built-in command:", error);
        return false;
    }
}

// Generate menu with all available commands
function generateMenu(userPrefix, sessionId) {
    // Get built-in commands
    const builtInCommands = [
        { name: 'ping', tags: ['utility'] },
        { name: 'prefix', tags: ['settings'] },
        { name: 'menu', tags: ['utility'] },
        { name: 'public', tags: ['settings'] },
        { name: 'private', tags: ['settings'] },
        { name: 'mode', tags: ['settings'] },
        { name: 'silver', tags: ['utility'] }
    ];
    
    // Get commands from commands folder
    const folderCommands = [];
    for (const [pattern, command] of commands.entries()) {
        folderCommands.push({
            name: pattern,
            tags: command.tags || ['general']
        });
    }
    
    // Combine all commands
    const allCommands = [...builtInCommands, ...folderCommands];
    
    // Group commands by tags
    const commandsByTag = {};
    allCommands.forEach(cmd => {
        cmd.tags.forEach(tag => {
            if (!commandsByTag[tag]) {
                commandsByTag[tag] = [];
            }
            commandsByTag[tag].push(cmd);
        });
    });
    
    // Generate menu text with vertical style (no usage/links)
    let menuText = `
🚀 ${BOT_NAME} 🚀

📌 Prefix : ${userPrefix}
👤 Owner  : ${OWNER_NAME}
🔧 Total  : ${allCommands.length} commands


📋 MENU LIST
───────────────────
`;

    for (const [tag, cmds] of Object.entries(commandsByTag)) {
        menuText += `\n🔹 ${tag.toUpperCase()}:\n`;

        // Each command on a new line
        for (const cmd of cmds) {
            menuText += `   ➤ ${userPrefix}${cmd.name}\n`;
        }
    }

   
