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

// 🧠 SMART CACHE SYSTEM (The fix for duplicates)
// Structure: { 'hentai': [url1, url2, url3...], 'real': [url1...] }
const contentCache = {};
let autoPostInterval = null;

client.once('ready', async () => {
    console.log(`🚀 Batch-Loader Bot is online as ${client.user.tag}`);
    client.user.setActivity('Loading Cache...', { type: ActivityType.Playing });

    const commands = [
        new SlashCommandBuilder()
            .setName('content')
            .setDescription('Get Content (Instant Load)')
            .addStringOption(option =>
                option.setName('category')
                .setDescription('Select Category')
                .setRequired(true)
                .addChoices(
                    { name: '🔞 Hentai (Anime)', value: 'hentai' },
                    { name: '👙 Real (3D Girls)', value: 'real' },
                    { name: '🎥 Videos/GIFs', value: 'video' },
                    { name: '👘 Cosplay', value: 'cosplay' },
                    { name: '🦶 Feet', value: 'feet' },
                    { name: '🍆 Trap', value: 'trap' },
                    { name: '🎲 Random', value: 'random' }
                ))
            .addStringOption(option => 
                option.setName('custom_search')
                .setDescription('Search specific tag (e.g. overwatch, redhead)')
                .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('refill')
            .setDescription('Admin: Force Clear Cache')
    ];

    await client.application.commands.set(commands);
});

// ---------------------------------------------------------
// ⚙️ THE BATCH ENGINE (Loads 50 images at once)
// ---------------------------------------------------------
async function getContentFromCache(category, customTag) {
    const key = customTag ? `custom_${customTag}` : category;

    // 1. If cache has items, give one instantly
    if (contentCache[key] && contentCache[key].length > 0) {
        // Pop removes the item from array so it is NEVER shown again
        const item = contentCache[key].pop();
        return item;
    }

    // 2. If cache is empty, REFILL IT (Fetch 20-50 items)
    // This part takes 2 seconds, but happens rarely
    try {
        let newItems = [];

        // --- SOURCE A: NEKOS.BEST (Very fast, Anime/Hentai) ---
        if (['hentai', 'cosplay', 'trap'].includes(category) && !customTag) {
            let nekoCat = 'hentai';
            if (category === 'neko') nekoCat = 'neko';
            // Nekos.best allows fetching batch amounts
            const res = await axios.get(`https://nekos.best/api/v2/${nekoCat}?amount=20`);
            newItems = res.data.results.map(i => ({ url: i.url, source: 'Nekos.best', isVideo: false }));
        }
        
        // --- SOURCE B: WAIFU.IM (Anime) ---
        else if (category === 'hentai' && !customTag) {
             const res = await axios.get(`https://api.waifu.im/search?included_tags=hentai&is_nsfw=true&many=true`); // many=true gets 30 items
             newItems = res.data.images.map(i => ({ url: i.url, source: 'Waifu.im', isVideo: false }));
        }

        // --- SOURCE C: REDDIT BATCH (The Heavy Lifter) ---
        // This works for Real, Video, Custom, and Feet
        else {
            let tag = customTag || category;
            if (category === 'real') tag = 'realgirls+gonewild+nsfw';
            if (category === 'video') tag = 'nsfw_gifs+porninfifteenseconds+60fpsporn';
            if (category === 'feet') tag = 'feet+feetpics';

            // Fetch 50 items at once!
            const res = await axios.get(`https://meme-api.com/gimme/${tag}/50`);
            
            if (res.data.memes && res.data.memes.length > 0) {
                newItems = res.data.memes.map(i => ({
                    url: i.url,
                    source: `r/${i.subreddit}`,
                    isVideo: (i.url.includes('.mp4') || i.url.includes('.gif') || i.url.includes('webm'))
                }));
            }
        }

        if (newItems.length === 0) return null;

        // Shuffle the items for variety
        newItems = newItems.sort(() => Math.random() - 0.5);

        // Save to cache
        contentCache[key] = newItems;

        // Return the first one
        return contentCache[key].pop();

    } catch (e) {
        console.error("API Error:", e.message);
        return null;
    }
}

// ---------------------------------------------------------
// 🎮 INTERACTION HANDLER
// ---------------------------------------------------------
client.on('interactionCreate', async interaction => {
    
    // --- BUTTONS ---
    if (interaction.isButton()) {
        const [action, data] = interaction.customId.split(':');

        // DELETE (ADMIN ONLY)
        if (action === 'delete') {
            if (interaction.user.id !== ADMIN_ID) {
                return interaction.reply({ content: '⛔ **Admin Only**', ephemeral: true });
            }
            return interaction.message.delete();
        }

        // SAVE DM
        if (action === 'dm') {
            try {
                await interaction.user.send(`**Saved:**\n${data}`);
                return interaction.reply({ content: '✅ Saved to DM.', ephemeral: true });
            } catch {
                return interaction.reply({ content: '❌ I cannot DM you. Open your settings.', ephemeral: true });
            }
        }

        // NEXT (INSTANT LOAD)
        if (action === 'next') {
            // "data" has format: category|customTag
            const [category, customTagRaw] = data.split('|');
            const customTag = customTagRaw === 'null' ? null : customTagRaw;

            // Important: We use deferUpdate to stop the "Interaction Failed" error instantly
            // Then we edit the message with new content
            try {
                // If it's a follow-up button, we might want to send a NEW message instead of editing
                // But for "Next", usually editing the embed is cleaner, OR sending a new one.
                // You asked for "Previous content watched", so let's SEND A NEW MESSAGE
                // so the old one stays in chat history.
                
                await interaction.deferReply(); // Create new thinking state
                await sendContent(interaction, category, customTag, false); // Send new msg
            } catch (err) {
                console.log("Button Error");
            }
            return;
        }
    }

    if (!interaction.isCommand()) return;

    // CHANNEL LOCK
    if (interaction.channelId !== CHANNEL_ID && interaction.commandName !== 'refill') {
        return interaction.reply({ content: `❌ Go to <#${CHANNEL_ID}>`, ephemeral: true });
    }

    // COMMAND: CONTENT
    if (interaction.commandName === 'content') {
        const category = interaction.options.getString('category');
        const custom = interaction.options.getString('custom_search');
        await sendContent(interaction, category, custom, false);
    }

    // COMMAND: REFILL
    if (interaction.commandName === 'refill') {
        if (interaction.user.id !== ADMIN_ID) return interaction.reply({ content: '⛔ Admin Only', ephemeral: true });
        
        // Wipe memory
        for (let key in contentCache) delete contentCache[key];
        
        return interaction.reply({ content: '🔋 **Cache Wiped.** New content will be fetched fresh.', ephemeral: true });
    }
});

// ---------------------------------------------------------
// 💲 PREFIX HANDLER
// ---------------------------------------------------------
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    if (message.channelId !== CHANNEL_ID) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // AUTO POST (ADMIN)
    if (command === 'autopost') {
        if (message.author.id !== ADMIN_ID) return message.reply('⛔ Admin Only.');
        if (args[0] === 'off') {
            clearInterval(autoPostInterval);
            return message.reply('🛑 Stopped.');
        }
        if (args[0] === 'on') {
            message.reply('✅ Auto-Post: Every 30s');
            autoPostInterval = setInterval(async () => {
                const channel = await client.channels.fetch(CHANNEL_ID);
                await sendContent(channel, 'random', null, true);
            }, 30000);
            return;
        }
    }

    // Shortcuts
    await sendContent(message, 'custom', command, true);
});

// ---------------------------------------------------------
// 📤 SENDER LOGIC
// ---------------------------------------------------------
async function sendContent(context, category, customTag, isPrefix) {
    // 1. Loading State
    if (!isPrefix && context.deferReply && !context.deferred && !context.replied) {
        await context.deferReply();
    }

    // 2. Get Data (From Cache/Batch)
    const data = await getContentFromCache(category, customTag);

    // 3. Handle Empty/Error
    if (!data) {
        const err = '⚠️ **Loading/Error:** Sources are busy or tag is empty. Click Next or Refill.';
        if (isPrefix) return context.channel.send(err);
        return context.editReply(err);
    }

    // 4. Buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`next:${category}|${customTag}`)
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`dm:${data.url}`)
            .setLabel('📩 Save')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setLabel('Download 📥')
            .setStyle(ButtonStyle.Link)
            .setURL(data.url),
        new ButtonBuilder()
            .setCustomId('delete:void')
            .setLabel('🗑️')
            .setStyle(ButtonStyle.Danger)
    );

    const contentText = `**Tag:** ${customTag || category} | **Src:** ${data.source}`;
    const payload = { components: [row] };

    // 5. Build Message
    if (data.isVideo) {
        payload.content = `🎥 ${contentText}\n${data.url}`;
        // If it was an embed before, we must clear it for video to show link preview
        payload.embeds = [];
    } else {
        const embed = new EmbedBuilder()
            .setDescription(contentText)
            .setImage(data.url)
            .setColor(0xE91E63);
        payload.embeds = [embed];
        payload.content = ''; // Clear old video links if any
    }

    // 6. Send
    if (context.send && isPrefix) return context.send(payload); // Auto-post/Prefix
    
    // For Slash Commands & Buttons
    // ALWAYS use editReply if we deferred, but for "Next" we want a NEW message history?
    // User requested "Previous content watched" -> This implies they want history.
    // So for "Next" button, we actually did interaction.deferReply() inside the button handler above.
    // So we use editReply to fill THAT new reply.
    return context.editReply(payload);
}

client.login(process.env.DISCORD_TOKEN);
