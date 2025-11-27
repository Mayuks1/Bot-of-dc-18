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

// 🤖 SYSTEM STATE
let autoPostInterval = null;

client.once('ready', async () => {
    console.log(`⚡ God-Mode Bot is online as ${client.user.tag}`);
    client.user.setActivity('Waiting for Admin...', { type: ActivityType.Watching });

    const commands = [
        new SlashCommandBuilder()
            .setName('content')
            .setDescription('Open the Vault')
            .addStringOption(option =>
                option.setName('category')
                .setDescription('Select Category (or use Custom to search anything)')
                .setRequired(true)
                .addChoices(
                    { name: '🔞 Hentai (Best)', value: 'hentai' },
                    { name: '👙 Real (Girls)', value: 'real' },
                    { name: '🎥 Video/GIF', value: 'video' },
                    { name: '👅 Oral/Blowjob', value: 'blowjob' },
                    { name: '🍑 Ass/Booty', value: 'ass' },
                    { name: '🍒 Boobs/Tits', value: 'boobs' },
                    { name: '👗 Cosplay', value: 'cosplay' },
                    { name: '🦶 Feet', value: 'feet' },
                    { name: '🦵 Thighs', value: 'thighs' },
                    { name: '👘 Maid', value: 'maid' },
                    { name: '👭 Yuri (Girl x Girl)', value: 'yuri' },
                    { name: '🍆 Trap', value: 'trap' },
                    { name: '🎲 Random', value: 'random' }
                ))
            .addStringOption(option => 
                option.setName('custom_search')
                .setDescription('Type ANY specific tag (e.g. overwatch, milf, redhead) - Creates 40+ Options!')
                .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('refill')
            .setDescription('Admin: Fix Bot')
    ];

    await client.application.commands.set(commands);
});

// ---------------------------------------------------------
// 🧠 CONTENT ENGINE
// ---------------------------------------------------------
async function fetchContent(category, customTag) {
    let url = '';
    let source = '';
    let isVideo = false;

    // Determine Tag/Subreddit
    let tag = customTag || category;
    
    // Smart Mapping for Categories
    if (!customTag) {
        if (category === 'real') tag = 'realgirls+gonewild+nsfw';
        if (category === 'video') tag = 'nsfw_gifs+60fpsporn+porninfifteenseconds';
        if (category === 'ass') tag = 'ass+paag+booty';
        if (category === 'boobs') tag = 'boobs+tits+pokies';
        if (category === 'blowjob') tag = 'blowjobs+facefuck';
    }

    try {
        // Source Selector: Waifu.im vs Reddit
        // Waifu.im is better for Hentai/Anime tags
        const animeTags = ['hentai', 'maid', 'waifu', 'uniform', 'trap', 'yuri'];
        
        if (animeTags.includes(category) && !customTag) {
            // Use Waifu.im
            const response = await axios.get(`https://api.waifu.im/search?included_tags=${category}&is_nsfw=true`);
            const img = response.data.images[0];
            url = img.url;
            source = `Waifu.im (${category})`;
        } else {
            // Use Reddit (Meme-API) for everything else (Real, Videos, Custom)
            const response = await axios.get(`https://meme-api.com/gimme/${tag}`);
            if (response.data.code) throw new Error('Subreddit not found');
            url = response.data.url;
            source = `r/${response.data.subreddit}`;
        }

        // Video Detection
        if (url.includes('.mp4') || url.includes('.gif') || url.includes('webm')) {
            isVideo = true;
        }

        return { url, source, isVideo };

    } catch (e) {
        console.error(e);
        return null;
    }
}

// ---------------------------------------------------------
// 🎮 INTERACTION HANDLER
// ---------------------------------------------------------
client.on('interactionCreate', async interaction => {
    
    // --- BUTTON HANDLING ---
    if (interaction.isButton()) {
        const [action, data] = interaction.customId.split(':');

        // 1. DELETE (ADMIN ONLY LOCK)
        if (action === 'delete') {
            if (interaction.user.id !== ADMIN_ID) {
                return interaction.reply({ content: '⛔ **Admin Only:** You cannot delete this.', ephemeral: true });
            }
            return interaction.message.delete();
        }

        // 2. SAVE TO DM (PRIVACY)
        if (action === 'dm') {
            // Send the URL to user's DM
            try {
                await interaction.user.send(`**Saved Content:**\n${data}`);
                return interaction.reply({ content: '✅ **Sent to DM!** Check your private messages.', ephemeral: true });
            } catch (err) {
                return interaction.reply({ content: '❌ **Error:** Open your DMs so I can send it.', ephemeral: true });
            }
        }

        // 3. NEXT BUTTON (INFINITE SCROLL)
        if (action === 'next') {
            // "data" contains the category they were looking at
            const [category, customTag] = data.split('|');
            // Treat 'undefined' string as actual undefined
            const finalCustom = customTag === 'undefined' ? null : customTag;
            
            await sendContent(interaction, category, finalCustom, true); // True = FollowUp
            return;
        }
    }

    if (!interaction.isCommand()) return;

    // CHANNEL LOCK
    if (interaction.channelId !== CHANNEL_ID && interaction.commandName !== 'refill') {
        return interaction.reply({ content: `❌ **Wrong Channel!** Go to <#${CHANNEL_ID}>`, ephemeral: true });
    }

    // --- COMMAND: CONTENT ---
    if (interaction.commandName === 'content') {
        const category = interaction.options.getString('category');
        const custom = interaction.options.getString('custom_search');
        await sendContent(interaction, category, custom, false);
    }

    // --- COMMAND: REFILL ---
    if (interaction.commandName === 'refill') {
        if (interaction.user.id !== ADMIN_ID) return interaction.reply({ content: '⛔ Admin Only', ephemeral: true });
        return interaction.reply({ content: '🔋 System Refilled.', ephemeral: true });
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

    // --- AUTO POST SYSTEM (ADMIN ONLY) ---
    if (command === 'autopost') {
        if (message.author.id !== ADMIN_ID) return message.reply('⛔ Admin Only.');
        
        const mode = args[0]; // 'on' or 'off'
        
        if (mode === 'off') {
            clearInterval(autoPostInterval);
            client.user.setActivity('Waiting for Admin...', { type: ActivityType.Watching });
            return message.reply('🛑 Auto-Post Stopped.');
        }

        if (mode === 'on') {
            if (autoPostInterval) clearInterval(autoPostInterval);
            message.reply('✅ **Auto-Post Started:** Posting random content every 30 seconds.');
            client.user.setActivity('Auto-Posting Mode 🚀', { type: ActivityType.Playing });

            // Loop every 30 seconds
            autoPostInterval = setInterval(async () => {
                const channel = await client.channels.fetch(CHANNEL_ID);
                // Simulate a "Random" request
                await sendContent(channel, 'random', null, false, true);
            }, 30000); 
            return;
        }
    }

    // --- SHORTCUT COMMANDS ---
    // User can type $feet, $thighs, $overwatch, etc.
    // If command matches our list, use it. If not, treat as Custom Search.
    await sendContent(message, 'custom', command, false, true);
});

// ---------------------------------------------------------
// 📤 SENDER LOGIC
// ---------------------------------------------------------
async function sendContent(context, category, customTag, isFollowUp, isPrefix) {
    if (!isPrefix && !isFollowUp && context.deferReply) await context.deferReply();

    const data = await fetchContent(category, customTag);

    if (!data) {
        const err = '❌ **No Content Found.** Try a different tag.';
        if (isPrefix || context instanceof Object && !context.reply) { // Handle channel object for autopost
             if (context.send) context.send(err);
             return;
        } 
        if (isFollowUp) return context.followUp({ content: err, ephemeral: true });
        return context.editReply(err);
    }

    // BUTTONS
    const row = new ActionRowBuilder().addComponents(
        // Next Button (Passes current category forward)
        new ButtonBuilder()
            .setCustomId(`next:${category}|${customTag}`)
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Success),
        
        // Save to DM Button
        new ButtonBuilder()
            .setCustomId(`dm:${data.url}`)
            .setLabel('📩 Save')
            .setStyle(ButtonStyle.Secondary),

        // Download Button
        new ButtonBuilder()
            .setLabel('Download 📥')
            .setStyle(ButtonStyle.Link)
            .setURL(data.url),

        // Delete Button (ADMIN ONLY)
        new ButtonBuilder()
            .setCustomId('delete:void')
            .setLabel('🗑️ Admin Del')
            .setStyle(ButtonStyle.Danger)
    );

    const payload = { components: [row] };
    const contentText = `**Tag:** ${customTag || category} | **Src:** ${data.source}`;

    if (data.isVideo) {
        payload.content = `🎥 ${contentText}\n${data.url}`;
    } else {
        const embed = new EmbedBuilder()
            .setDescription(contentText)
            .setImage(data.url)
            .setColor(0x9B59B6); // Purple
        payload.embeds = [embed];
    }

    // Sending Logic
    if (context.send && isPrefix) return context.send(payload); // For $autopost and prefix
    if (isPrefix) return context.reply(payload);
    if (isFollowUp) return context.followUp(payload);
    return context.editReply(payload);
}

client.login(process.env.DISCORD_TOKEN);
