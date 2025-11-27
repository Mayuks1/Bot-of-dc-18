require('dotenv').config();
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType 
} = require('discord.js');
const axios = require('axios');

// ⚙️ CONFIGURATION (ZYRAAN SYSTEM)
const ADMIN_ID = '934670194096345118';
const CHANNEL_ID = '1443508248211750964';
const BOT_NAME = 'ZYRAAN';
const COLOR_THEME = 0xFF0055; // Professional Red/Pink
const PREFIX = '$';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// 📂 DATABASE OF SOURCES (No API Keys Needed)
// The bot picks random subreddits from here to ensure variety
const SOURCES = {
    real: ['realgirls', 'gonewild', 'nsfw', 'baddies', 'honeybirdette', 'godpussy', 'suicidegirls'],
    nude: ['nude', 'simps', 'pussy', 'titstouching', 'grool', 'creampie'],
    ass: ['ass', 'pawg', 'booty', 'thick', 'asstastic', 'butt'],
    boobs: ['boobs', 'tits', 'pokies', 'hugeboobs', 'drop'],
    feet: ['feet', 'feetpics', 'toes'],
    thighs: ['thighs', 'thighhighs', 'thickthighs'],
    cosplay: ['cosplaybabes', 'nsfwcosplay', 'cosplayonoff'],
    video: ['nsfw_gifs', '60fpsporn', 'porninfifteenseconds', 'lesbian_gifs', 'cumsluts_gifs'],
    hentai: ['hentai', 'rule34', 'ecchi', 'anime_nsfw'] // Fallback if Waifu API fails
};

// 🤖 SYSTEM STATE
let autoPostInterval = null;

client.once('ready', async () => {
    console.log(`✅ ${BOT_NAME} System Online`);
    console.log(`🛡️ Admin ID: ${ADMIN_ID}`);
    
    client.user.setActivity('Only 18+ Content', { type: ActivityType.Restricted });

    // REGISTER SLASH COMMANDS
    const commands = [
        new SlashCommandBuilder()
            .setName('zyraan')
            .setDescription('Access ZYRAAN Content Vault')
            .addStringOption(option =>
                option.setName('category')
                .setDescription('Select Content Type')
                .setRequired(true)
                .addChoices(
                    { name: '🔥 Nude (Hardcore)', value: 'nude' },
                    { name: '👙 Real (Soft/Tease)', value: 'real' },
                    { name: '🎥 Video/GIF (Motion)', value: 'video' },
                    { name: '🔞 Hentai (Anime)', value: 'hentai' },
                    { name: '🍑 Ass/Booty', value: 'ass' },
                    { name: '🍒 Boobs/Tits', value: 'boobs' },
                    { name: '🦶 Feet', value: 'feet' },
                    { name: '👗 Cosplay', value: 'cosplay' },
                    { name: '🎲 Random Mix', value: 'random' }
                ))
            .addStringOption(option => 
                option.setName('search')
                .setDescription('Search specific tag (e.g. redhead, milf, latina)')
                .setRequired(false)),

        new SlashCommandBuilder()
            .setName('admin')
            .setDescription('Admin Controls')
    ];

    await client.application.commands.set(commands);
});

// ---------------------------------------------------------
// 🧠 INTELLIGENT FETCHER (RETRIES IF FAIL)
// ---------------------------------------------------------
async function getVisuals(category, customSearch) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            attempts++;
            let url = '';
            let source = '';
            let isVideo = false;

            // 1. WAIFU.IM (Priority for Hentai)
            if (category === 'hentai' && !customSearch) {
                const res = await axios.get('https://api.waifu.im/search?included_tags=hentai&is_nsfw=true');
                if (res.data.images && res.data.images.length > 0) {
                    return { url: res.data.images[0].url, source: 'Waifu Database', isVideo: false };
                }
            }

            // 2. REDDIT AGGREGATOR (Meme-API)
            let subreddit = 'nsfw';
            
            if (customSearch) {
                subreddit = customSearch.replace(/\s+/g, ''); // Remove spaces
            } else if (SOURCES[category]) {
                // Pick a random subreddit from our list
                const list = SOURCES[category];
                subreddit = list[Math.floor(Math.random() * list.length)];
            }

            // Fetch from Reddit
            const res = await axios.get(`https://meme-api.com/gimme/${subreddit}`);
            
            // Validation: Must be an image or video, not a text post
            if (res.data.code) throw new Error('Subreddit Banned/Private');
            if (res.data.nsfw === false && !customSearch) throw new Error('Not NSFW'); // Skip Safe content
            
            url = res.data.url;
            source = `r/${res.data.subreddit}`;

            // Check file type
            if (url.includes('.mp4') || url.includes('.gif') || url.includes('webm')) isVideo = true;

            // If we got here, success!
            return { url, source, isVideo };

        } catch (e) {
            // If failed, loop and try again (up to 3 times)
            console.log(`Attempt ${attempts} failed: ${e.message}`);
            if (attempts === maxAttempts) return null;
        }
    }
}

// ---------------------------------------------------------
// 🎮 EVENT: INTERACTION (SLASH COMMANDS & BUTTONS)
// ---------------------------------------------------------
client.on('interactionCreate', async interaction => {
    
    // 🔒 1. CHANNEL SECURITY LOCK
    const isRefill = interaction.commandName === 'admin' || interaction.customId === 'delete';
    if (interaction.channelId !== CHANNEL_ID && !isRefill && interaction.commandName !== 'admin') {
        return interaction.reply({ 
            content: `⛔ **ZYRAAN SECURITY:** Access denied. Go to <#${CHANNEL_ID}>`, 
            ephemeral: true 
        });
    }

    // 🛑 2. BUTTON HANDLING
    if (interaction.isButton()) {
        const [action, data] = interaction.customId.split(':');

        // A. DELETE (ADMIN ONLY)
        if (action === 'delete') {
            if (interaction.user.id !== ADMIN_ID) {
                return interaction.reply({ content: '🔒 **Admin Only**', ephemeral: true });
            }
            await interaction.message.delete();
            return; // Done
        }

        // B. SAVE TO DM (Fixed Logic)
        if (action === 'dm') {
            await interaction.deferReply({ ephemeral: true }); // Prevent timeout
            try {
                // We scrape the URL from the embed or message content
                let urlToSave = interaction.message.content; // Try video link first
                if (interaction.message.embeds.length > 0 && interaction.message.embeds[0].image) {
                    urlToSave = interaction.message.embeds[0].image.url;
                }
                
                if (!urlToSave || !urlToSave.startsWith('http')) {
                     return interaction.editReply('❌ **Error:** Could not find the image URL to save.');
                }

                await interaction.user.send(`**ZYRAAN Vault Saved:**\n${urlToSave}`);
                return interaction.editReply('✅ **Sent!** Check your Direct Messages.');
            } catch (err) {
                return interaction.editReply('⚠️ **Failed:** I cannot DM you. Please open your privacy settings.');
            }
        }

        // C. NEXT BUTTON (Infinite Scroll)
        if (action === 'next') {
            // Important: Defer update immediately to prevent "Interaction Failed"
            // We use 'deferReply' instead of 'deferUpdate' to send a NEW message below
            // If you want to replace the old one, use deferUpdate. 
            // Users prefer NEW messages so they don't lose the old one.
            
            // We pass the "data" (category) to the function
            const [category, tag] = data.split('|');
            const cleanTag = tag === 'null' ? null : tag;
            
            await outputContent(interaction, category, cleanTag, true); // true = FollowUp (New Message)
            return;
        }
    }

    if (!interaction.isCommand()) return;

    // 🛑 3. COMMAND: ADMIN
    if (interaction.commandName === 'admin') {
        if (interaction.user.id !== ADMIN_ID) return interaction.reply({ content: '🔒 Admin Access Only', ephemeral: true });
        return interaction.reply({ content: '✅ **ZYRAAN System Refreshed.** Connection stable.', ephemeral: true });
    }

    // 🛑 4. COMMAND: ZYRAAN (MAIN)
    if (interaction.commandName === 'zyraan') {
        const category = interaction.options.getString('category');
        const search = interaction.options.getString('search');
        await outputContent(interaction, category, search, false);
    }
});

// ---------------------------------------------------------
// 💲 PREFIX HANDLER ($ COMMANDS)
// ---------------------------------------------------------
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    if (message.channelId !== CHANNEL_ID) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // AUTO-POST (ADMIN ONLY)
    if (command === 'autopost') {
        if (message.author.id !== ADMIN_ID) return message.reply('🔒 Admin Only.');
        
        if (args[0] === 'stop') {
            clearInterval(autoPostInterval);
            return message.reply('🛑 **Auto-Upload Stopped.**');
        }

        message.reply('✅ **Auto-Upload Initiated:** Posting every 20 seconds.');
        // Loop
        autoPostInterval = setInterval(async () => {
            const channel = await client.channels.fetch(CHANNEL_ID);
            // Random Category
            const cats = ['nude', 'real', 'hentai', 'boobs', 'ass'];
            const randomCat = cats[Math.floor(Math.random() * cats.length)];
            
            // Reuse output logic, but for "channel" object
            await outputContent(channel, randomCat, null, false, true);
        }, 20000); // 20 Seconds
        return;
    }

    // SHORTCUTS ($nude, $real)
    const validCmds = ['nude', 'real', 'hentai', 'ass', 'boobs', 'feet', 'video', 'random'];
    if (validCmds.includes(command)) {
        await outputContent(message, command, null, false, true);
    } else {
        // Treat as search: $milf
        await outputContent(message, 'random', command, false, true);
    }
});

// ---------------------------------------------------------
// 📤 OUTPUT ENGINE (THE UI BUILDER)
// ---------------------------------------------------------
async function outputContent(context, category, customSearch, isFollowUp, isPrefix) {
    // 1. Loading State (Prevents Timeout)
    if (!isPrefix && !context.send) {
        if (isFollowUp) {
            // Button Click
             // We don't defer here because we want to send a new message immediately, 
             // but strictly speaking we should reply.
             // We will handle it in the send logic.
        } else {
            // Slash Command
            await context.deferReply(); 
        }
    }

    // 2. Fetch Data
    const data = await getVisuals(category, customSearch);

    // 3. Error Handling
    if (!data) {
        const err = '⚠️ **Connection Error:** Reddit/API is busy. Try clicking Next again.';
        if (isPrefix || context.send) return context.send ? context.send(err) : context.reply(err);
        if (isFollowUp) return context.followUp({ content: err, ephemeral: true });
        return context.editReply(err);
    }

    // 4. Build Buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`next:${category}|${customSearch || 'null'}`)
            .setLabel('Next 🔥')
            .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
            .setCustomId('dm:save') // We don't pass URL here anymore to avoid length limit
            .setLabel('📩 Save DM')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setLabel('Link 🔗')
            .setStyle(ButtonStyle.Link)
            .setURL(data.url),

        new ButtonBuilder()
            .setCustomId('delete:void')
            .setLabel('🗑️')
            .setStyle(ButtonStyle.Danger)
    );

    // 5. Build Message
    const payload = { components: [row] };
    const title = `ZYRAAN | ${customSearch ? customSearch.toUpperCase() : category.toUpperCase()}`;
    
    if (data.isVideo) {
        // Discord embeds videos better as plain links
        payload.content = `🎥 **${title}**\n${data.url}`;
    } else {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setImage(data.url)
            .setColor(COLOR_THEME)
            .setFooter({ text: `Source: ${data.source} • Trusted by ZYRAAN` });
        payload.embeds = [embed];
    }

    // 6. Send
    try {
        if (context.send && isPrefix) return context.send(payload); // Prefix / Autopost
        if (isFollowUp) return context.reply(payload); // Button Click -> New Message
        return context.editReply(payload); // Slash Command
    } catch (e) {
        console.error("Sending failed:", e);
    }
}

client.login(process.env.DISCORD_TOKEN);
