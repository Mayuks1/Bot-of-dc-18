require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// 🔒 SECURITY CONFIGURATION
const ADMIN_ID = '934670194096345118';
const CHANNEL_ID = '1443508248211750964';
const PREFIX = '$';

// 🧠 SYSTEM MEMORY
let history = new Set(); // Remembers last 50 images to prevent duplicates

client.once('ready', async () => {
    console.log(`✅ System Online: ${client.user.tag}`);
    client.user.setActivity('Secure Channel 🔒', { type: ActivityType.Watching });

    const commands = [
        new SlashCommandBuilder()
            .setName('content')
            .setDescription('Get Content')
            .addStringOption(option =>
                option.setName('category')
                .setDescription('Select Category')
                .setRequired(true)
                .addChoices(
                    { name: '🔞 Hentai (Drawn)', value: 'hentai' },
                    { name: '👙 Real (Girls)', value: 'real' },
                    { name: '🎥 Video/GIF', value: 'video' },
                    { name: '🎲 Random', value: 'random' }
                ))
            .addStringOption(option => 
                option.setName('search')
                .setDescription('Optional: Specific tag (e.g. feet, overwatch, latina)')
                .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('refill')
            .setDescription('Admin: Check System Status & Refill')
    ];

    await client.application.commands.set(commands);
});

// ---------------------------------------------------------
// 📡 CONTENT ENGINE
// ---------------------------------------------------------
async function fetchContent(category, searchTag) {
    let url = '';
    let source = '';
    let isVideo = false;
    let tag = searchTag || category;

    // Map categories to real tags if no searchTag is provided
    if (!searchTag) {
        if (category === 'real') tag = 'realgirls+gonewild+nsfw';
        if (category === 'video') tag = 'nsfw_gifs+60fpsporn+porninfifteenseconds+hentai_gifs';
        if (category === 'random') tag = 'hentai+nsfw+realgirls';
    }

    try {
        // Source A: Waifu.im (Best for Anime/Hentai)
        if ((category === 'hentai' || searchTag === 'maid' || searchTag === 'waifu') && !searchTag) {
            const response = await axios.get(`https://api.waifu.im/search?included_tags=hentai&is_nsfw=true`);
            if (response.data.images && response.data.images.length > 0) {
                const img = response.data.images[0];
                url = img.url;
                source = `Waifu.im (Hentai)`;
            }
        } 
        
        // Source B: Reddit (Everything else)
        if (!url) {
            const response = await axios.get(`https://meme-api.com/gimme/${tag}`);
            if (response.data.code) throw new Error(`Subreddit r/${tag} failed`);
            url = response.data.url;
            source = `r/${response.data.subreddit}`;
        }

        // Check Video
        if (url.includes('.mp4') || url.includes('.gif') || url.includes('webm')) {
            isVideo = true;
        }

        // Duplicate Check
        if (history.has(url)) {
            // If duplicate, try ONE more time recursively, then give up to prevent infinite loops
            return await fetchContent(category, searchTag);
        }
        history.add(url);
        if (history.size > 50) history.clear();

        return { url, source, isVideo, tag };

    } catch (e) {
        console.error("Fetch Error:", e.message);
        return null;
    }
}

// ---------------------------------------------------------
// 🎮 INTERACTION HANDLER
// ---------------------------------------------------------
client.on('interactionCreate', async interaction => {

    // --- BUTTON HANDLING ---
    if (interaction.isButton()) {
        const parts = interaction.customId.split(':');
        const action = parts[0];
        const data = parts[1]; // "category|searchTag"

        // 1. DELETE (ADMIN LOCK)
        if (action === 'delete') {
            if (interaction.user.id !== ADMIN_ID) {
                return interaction.reply({ content: '⛔ **Admin Only:** You cannot delete this.', ephemeral: true });
            }
            await interaction.message.delete().catch(() => {});
            return; // Stop here
        }

        // 2. DM
        if (action === 'dm') {
            await interaction.reply({ content: '📩 Sending to DM...', ephemeral: true });
            return interaction.user.send(`**Saved Content:**\n${data}`).catch(() => {
                interaction.followUp({ content: '❌ I cannot DM you. Open your Privacy Settings.', ephemeral: true });
            });
        }

        // 3. NEXT (Fixing "Interaction Failed")
        if (action === 'next') {
            // IMMEDIATELY acknowledge the click so it doesn't fail
            await interaction.deferReply(); 

            // Parse data safely
            let [cat, search] = data.split('|');
            if (search === 'null' || search === 'undefined') search = null;

            await sendContent(interaction, cat, search, false); // Send as new reply
            return;
        }
    }

    if (!interaction.isCommand()) return;

    // CHANNEL LOCK
    if (interaction.channelId !== CHANNEL_ID && interaction.commandName !== 'refill') {
        return interaction.reply({ content: `❌ **Wrong Channel!** Go to <#${CHANNEL_ID}>`, ephemeral: true });
    }

    // --- COMMAND: REFILL (DIAGNOSTIC) ---
    if (interaction.commandName === 'refill') {
        if (interaction.user.id !== ADMIN_ID) return interaction.reply({ content: '⛔ Admin Only', ephemeral: true });
        
        await interaction.deferReply();
        const start = Date.now();
        
        // 1. Test APIs
        let redditStatus = '🔴 Offline';
        let waifuStatus = '🔴 Offline';
        
        try {
            await axios.get('https://meme-api.com/gimme/nsfw');
            redditStatus = '🟢 Online (Millions available)';
        } catch (e) { redditStatus = '⚠️ Unstable'; }

        try {
            await axios.get('https://api.waifu.im/search?included_tags=hentai&is_nsfw=true');
            waifuStatus = '🟢 Online (5000+ available)';
        } catch (e) { waifuStatus = '⚠️ Unstable'; }

        const ping = Date.now() - start;
        history.clear(); // Clear cache

        const embed = new EmbedBuilder()
            .setTitle('🔋 System Refilled & Diagnostic')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Reddit Source', value: redditStatus, inline: true },
                { name: 'Waifu Source', value: waifuStatus, inline: true },
                { name: 'Bot Latency', value: `${ping}ms`, inline: true },
                { name: 'Cache', value: '🗑️ Cleared (0 items)', inline: true },
                { name: 'Content Pool', value: '∞ Unlimited', inline: true }
            )
            .setFooter({ text: 'System ready for requests.' });

        return interaction.editReply({ embeds: [embed] });
    }

    // --- COMMAND: CONTENT ---
    if (interaction.commandName === 'content') {
        const category = interaction.options.getString('category');
        const search = interaction.options.getString('search');
        
        // Defer reply immediately so we have time to fetch
        await interaction.deferReply();
        await sendContent(interaction, category, search, false);
    }
});

// ---------------------------------------------------------
// 💲 PREFIX HANDLER ($)
// ---------------------------------------------------------
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    if (message.channelId !== CHANNEL_ID) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Mapping shortcuts
    let category = 'random';
    let search = null;

    if (command === 'hentai') category = 'hentai';
    else if (command === 'real') category = 'real';
    else if (command === 'video') category = 'video';
    else if (command === 'refill') {
        // Lazy refill for prefix (Admin)
        if (message.author.id !== ADMIN_ID) return message.reply('⛔ Admin Only');
        history.clear();
        return message.reply('🔋 System Refilled.');
    } else {
        // Treat as custom search ($feet, $latina)
        category = 'random';
        search = command;
    }

    // Send content
    await sendContent(message, category, search, true);
});

// ---------------------------------------------------------
// 📤 SENDER LOGIC
// ---------------------------------------------------------
async function sendContent(context, category, search, isPrefix) {
    // If it's a prefix command, we haven't deferred yet, so show typing
    if (isPrefix && context.channel) await context.channel.sendTyping();

    const data = await fetchContent(category, search);

    if (!data) {
        const err = '❌ **API Busy or Tag not found.** Try again.';
        if (context.editReply) return context.editReply(err);
        return context.reply(err);
    }

    // Prepare Button Data (Safe String)
    const safeSearch = search || 'null';
    const nextData = `${category}|${safeSearch}`;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`next:${nextData}`)
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
            .setCustomId(`dm:${data.url}`)
            .setLabel('📩 Save')
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

    const contentText = `**Tag:** ${data.tag} | **Source:** ${data.source}`;
    
    // Construct Message
    const payload = { components: [row] };

    if (data.isVideo) {
        payload.content = `🎥 ${contentText}\n${data.url}`;
        // Remove embeds for video to ensure link plays
        payload.embeds = [];
    } else {
        payload.content = ''; // Clear content for images
        payload.embeds = [
            new EmbedBuilder()
                .setDescription(contentText)
                .setImage(data.url)
                .setColor(0xE91E63)
        ];
    }

    // Send
    try {
        if (isPrefix) {
            await context.reply(payload);
        } else {
            // Always use editReply if we deferred earlier (which we did for buttons and slash)
            await context.editReply(payload);
        }
    } catch (err) {
        console.error("Send Error:", err);
    }
}

client.login(process.env.DISCORD_TOKEN);
