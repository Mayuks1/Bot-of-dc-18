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

// 🔒 CONFIG
const ADMIN_ID = '934670194096345118';
const CHANNEL_ID = '1443508248211750964';
const PREFIX = '$';

// 🧠 MEMORY SYSTEM (Prevents Duplicates)
const history = new Set();
let autoPostInterval = null;

// 🗂️ CONTENT SOURCES
// We rotate subreddits to keep content fresh
const SOURCES = {
    real: 'realgirls+gonewild+nsfw+gentlemanboners+goddesses',
    hentai: 'hentai+animebooty+ecchi',
    video: 'nsfw_gifs+60fpsporn+porninfifteenseconds+nsfw_html5',
    ass: 'ass+paag+booty+asstastic',
    boobs: 'boobs+tits+pokies+hugeboobs',
    cosplay: 'cosplaybabes+nsfwcosplay',
    legs: 'thighs+legs+pantyhose',
    trap: 'traphentai+traps',
    yuri: 'yuri+girlskissing'
};

client.once('ready', async () => {
    console.log(`✅ Fixed Bot is online as ${client.user.tag}`);
    client.user.setActivity('Waiting for command...', { type: ActivityType.Watching });

    const commands = [
        new SlashCommandBuilder()
            .setName('content')
            .setDescription('Get HD Content')
            .addStringOption(option =>
                option.setName('category')
                .setDescription('Select Category')
                .setRequired(true)
                .addChoices(
                    { name: '🔞 Hentai (Anime)', value: 'hentai' },
                    { name: '👙 Real Girls (3D)', value: 'real' },
                    { name: '🎥 Video/GIF', value: 'video' },
                    { name: '🍑 Ass', value: 'ass' },
                    { name: '🍒 Boobs', value: 'boobs' },
                    { name: '👗 Cosplay', value: 'cosplay' },
                    { name: '🦵 Legs/Thighs', value: 'legs' },
                    { name: '👭 Yuri', value: 'yuri' },
                    { name: '🍆 Trap', value: 'trap' }
                ))
            .addStringOption(option => 
                option.setName('search')
                .setDescription('Specific tag (e.g. overwatch, redhead)')
                .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('refill')
            .setDescription('Admin: Reset Memory')
    ];

    await client.application.commands.set(commands);
});

// ---------------------------------------------------------
// 🚀 ENGINE: FETCH CONTENT (Retry Logic)
// ---------------------------------------------------------
async function fetchContent(category, customSearch) {
    let attempts = 0;
    const maxAttempts = 3; // Try 3 times to find a new image

    while (attempts < maxAttempts) {
        attempts++;
        try {
            let url = '';
            let source = '';
            let isVideo = false;

            // STRATEGY: Determine where to look
            // 1. NEKOS.BEST API (Fastest for Hentai/Neko)
            if (category === 'hentai' && !customSearch && Math.random() > 0.5) {
                const response = await axios.get('https://nekos.best/api/v2/hentai');
                url = response.data.results[0].url;
                source = 'Nekos.best API';
            }
            // 2. REDDIT (For Real, Videos, and specific searches)
            else {
                let tag = customSearch || SOURCES[category] || 'nsfw';
                const response = await axios.get(`https://meme-api.com/gimme/${tag}`);
                
                if (response.data.code) continue; // Subreddit failed, try again
                
                url = response.data.url;
                source = `r/${response.data.subreddit}`;
                
                // Skip Low Quality Images
                if (response.data.ups < 50) continue; 
            }

            // DUPLICATE CHECK
            if (history.has(url)) {
                console.log(`Duplicate detected (${url}), retrying...`);
                continue; // It's a duplicate, loop again
            }

            // SUCCESS!
            history.add(url);
            if (history.size > 100) history.clear(); // Clear memory after 100 images
            
            if (url.includes('.mp4') || url.includes('.gif') || url.includes('webm')) isVideo = true;

            return { url, source, isVideo };

        } catch (e) {
            console.error('Fetch Error:', e.message);
        }
    }
    return null; // Failed after 3 attempts
}

// ---------------------------------------------------------
// 🎮 EVENT: INTERACTION (Buttons & Slash)
// ---------------------------------------------------------
client.on('interactionCreate', async interaction => {
    
    // --- BUTTONS ---
    if (interaction.isButton()) {
        const [action, cat, tag] = interaction.customId.split(':');

        // FIX: "Interaction Failed" -> We must acknowledge immediately
        if (action !== 'delete') {
            // If it's Next or DM, we defer update immediately
            // This stops the button from spinning and failing
        }

        // 1. NEXT BUTTON
        if (action === 'next') {
            await interaction.deferReply(); // Send a NEW message
            // Convert 'null' string back to real null
            const actualTag = tag === 'null' ? null : tag;
            await sendContent(interaction, cat, actualTag, false);
            return;
        }

        // 2. SAVE BUTTON
        if (action === 'dm') {
            await interaction.deferReply({ ephemeral: true });
            try {
                // The URL is stored in the button ID?? No, too long.
                // We extract URL from the embed or content of the message
                let url = interaction.message.content;
                if (!url || !url.startsWith('http')) {
                    url = interaction.message.embeds[0]?.image?.url;
                }

                await interaction.user.send(`**Saved Content:**\n${url}`);
                await interaction.editReply('✅ Sent to your DMs!');
            } catch (e) {
                await interaction.editReply('❌ I cannot DM you. Check your privacy settings.');
            }
            return;
        }

        // 3. DELETE (ADMIN)
        if (action === 'delete') {
            if (interaction.user.id !== ADMIN_ID) {
                return interaction.reply({ content: '⛔ Admin Only', ephemeral: true });
            }
            await interaction.message.delete();
            return;
        }
    }

    // --- SLASH COMMANDS ---
    if (!interaction.isCommand()) return;

    // CHANNEL LOCK
    if (interaction.channelId !== CHANNEL_ID && interaction.commandName !== 'refill') {
        return interaction.reply({ content: `❌ **Wrong Channel.** Use <#${CHANNEL_ID}>`, ephemeral: true });
    }

    if (interaction.commandName === 'content') {
        const cat = interaction.options.getString('category');
        const search = interaction.options.getString('search');
        await sendContent(interaction, cat, search);
    }

    if (interaction.commandName === 'refill') {
        if (interaction.user.id !== ADMIN_ID) return interaction.reply({ content: '⛔ Admin Only', ephemeral: true });
        history.clear();
        return interaction.reply({ content: '🔋 **System Refilled:** Memory cleared.', ephemeral: true });
    }
});

// ---------------------------------------------------------
// 💲 PREFIX & AUTO-POST
// ---------------------------------------------------------
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    if (message.channelId !== CHANNEL_ID) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // AUTO POST
    if (command === 'autopost') {
        if (message.author.id !== ADMIN_ID) return message.reply('⛔ Admin Only.');
        
        if (args[0] === 'on') {
            if (autoPostInterval) clearInterval(autoPostInterval);
            message.reply('✅ **Auto-Post Started:** Rotating categories every 30s.');
            
            // Random Category List
            const cats = ['hentai', 'real', 'video', 'cosplay', 'ass', 'boobs'];
            
            autoPostInterval = setInterval(async () => {
                const randomCat = cats[Math.floor(Math.random() * cats.length)];
                const channel = await client.channels.fetch(CHANNEL_ID);
                await sendContent(channel, randomCat, null, true);
            }, 30000);
        } 
        else {
            clearInterval(autoPostInterval);
            message.reply('🛑 Auto-Post Stopped.');
        }
    }

    // SHORTCUTS ($hentai, $real)
    if (SOURCES[command]) {
        await sendContent(message, command, null, true);
    }
    else if (command !== 'autopost' && command !== 'refill') {
        // Treat as custom search ($overwatch)
        await sendContent(message, 'custom', command, true);
    }
});

// ---------------------------------------------------------
// 📤 SENDING LOGIC
// ---------------------------------------------------------
async function sendContent(context, category, search, isPrefix) {
    // 1. Set "Thinking" state
    if (!isPrefix && context.deferReply && !context.replied && !context.deferred) {
        await context.deferReply();
    }

    // 2. Fetch
    const data = await fetchContent(category, search);

    if (!data) {
        const err = '❌ **Network Error:** Could not find new content. Try again.';
        if (isPrefix || context.send) { if(context.send) context.send(err); return; }
        return context.editReply(err);
    }

    // 3. Build Buttons
    // Safe Tag handling for custom ID
    const safeTag = search ? search.substring(0, 20) : 'null'; 

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`next:${category}:${safeTag}`)
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('dm:save')
            .setLabel('📩 Save')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setLabel('Link 🔗')
            .setStyle(ButtonStyle.Link)
            .setURL(data.url),
        new ButtonBuilder()
            .setCustomId('delete:void:void')
            .setLabel('🗑️')
            .setStyle(ButtonStyle.Danger)
    );

    // 4. Send Message
    const footer = `Category: ${category} | Source: ${data.source}`;
    
    // Video Handling
    if (data.isVideo) {
        const content = `🎥 **Video Found:**\n${data.url}\n*${footer}*`;
        if (isPrefix || context.send) return context.send({ content: content, components: [row] });
        return context.editReply({ content: content, components: [row] });
    }

    // Image Handling
    const embed = new EmbedBuilder()
        .setImage(data.url)
        .setColor(0xE91E63)
        .setFooter({ text: footer });

    if (isPrefix || context.send) return context.send({ embeds: [embed], components: [row] });
    return context.editReply({ embeds: [embed], components: [row] });
}

client.login(process.env.DISCORD_TOKEN);
