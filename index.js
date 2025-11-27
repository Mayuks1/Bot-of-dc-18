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

// 🧠 MEMORY
const history = new Set();
let autoPostInterval = null;

// 🗂️ MASSIVE SOURCE LIST (50+ Sources to prevent errors)
const REPOSITORIES = {
    real: [
        'realgirls', 'gonewild', 'nsfw', 'pussy', 'tits', 'ass', 
        'collegesluts', 'legalteens', 'curvy', 'blowjobs', 'cumsluts',
        'palegirls', 'bonermaterial', 'amateur', 'nsfw_bw', 'suicidegirls'
    ],
    hentai: [
        'hentai', 'ecchi', 'animebooty', 'oppai', 'animemidriff', 
        'artistic_hentai', 'hentai_gif', 'swimsuithentai'
    ],
    video: [
        'nsfw_gifs', '60fpsporn', 'porninfifteenseconds', 'besthqporngifs',
        'nsfw_html5', 'gifsgonewild', 'adultgifs'
    ],
    cosplay: ['cosplaybabes', 'nsfwcosplay', 'cosplaybutts', 'cosplaygirls'],
    legs: ['thighs', 'legs', 'pantyhose', 'stockings'],
    ass: ['ass', 'paag', 'booty', 'asstastic', 'butt'],
    boobs: ['boobs', 'tits', 'hugeboobs', 'pokies']
};

client.once('ready', async () => {
    console.log(`💪 Robust Bot v6 is online as ${client.user.tag}`);
    client.user.setActivity('Serving Content 24/7', { type: ActivityType.Watching });

    const commands = [
        new SlashCommandBuilder()
            .setName('content')
            .setDescription('Get Unlimited Content')
            .addStringOption(option =>
                option.setName('category')
                .setDescription('Select Category')
                .setRequired(true)
                .addChoices(
                    { name: '👙 Real Nude (Girls)', value: 'real' },
                    { name: '🔞 Hentai (Anime)', value: 'hentai' },
                    { name: '🎥 Video/GIF', value: 'video' },
                    { name: '🍑 Ass/Butt', value: 'ass' },
                    { name: '🍒 Boobs', value: 'boobs' },
                    { name: '👗 Cosplay', value: 'cosplay' },
                    { name: '🦵 Legs/Thighs', value: 'legs' },
                    { name: '🍆 Trap/Femboy', value: 'trap' },
                    { name: '👭 Yuri', value: 'yuri' }
                ))
            .addStringOption(option => 
                option.setName('search')
                .setDescription('Specific tag (e.g. redhead, milf, overwatch)')
                .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('refill')
            .setDescription('Admin: Clear Cache')
    ];

    await client.application.commands.set(commands);
});

// ---------------------------------------------------------
// 🚀 THE ULTRA ROBUST FETCH ENGINE
// ---------------------------------------------------------
async function fetchContent(category, customSearch) {
    // Try up to 5 times to get content
    for (let i = 0; i < 5; i++) {
        try {
            const result = await attemptFetch(category, customSearch);
            if (result) return result;
        } catch (e) {
            // Log error silently and retry
            // console.log(`Attempt ${i+1} failed.`);
        }
    }
    return null; // Give up after 5 tries
}

async function attemptFetch(category, customSearch) {
    let url = '';
    let source = '';
    let isVideo = false;

    // STRATEGY 1: IF CUSTOM SEARCH
    if (customSearch) {
        const response = await axios.get(`https://meme-api.com/gimme/${customSearch}`);
        if (response.data.code) throw new Error('Bad Subreddit');
        url = response.data.url;
        source = `r/${response.data.subreddit}`;
    }
    // STRATEGY 2: CATEGORY LOGIC
    else {
        // Randomly decide between Reddit and APIs to spread load
        const rng = Math.random();

        // A. WAIFU.IM (Excellent for Hentai/Maid)
        if ((category === 'hentai' || category === 'maid') && rng > 0.5) {
            const res = await axios.get(`https://api.waifu.im/search?included_tags=${category === 'maid' ? 'maid' : 'hentai'}&is_nsfw=true`);
            url = res.data.images[0].url;
            source = 'Waifu.im';
        }
        // B. NEKOS.BEST (Fast for Neko/Hentai)
        else if (category === 'hentai' && rng > 0.8) {
             const res = await axios.get('https://nekos.best/api/v2/hentai');
             url = res.data.results[0].url;
             source = 'Nekos.best';
        }
        // C. REDDIT (The Main Engine)
        else {
            // Pick a RANDOM subreddit from our massive lists
            // If category doesn't exist in list (like 'trap'), default to 'nsfw'
            const list = REPOSITORIES[category] || ['nsfw', 'traphentai'];
            const randomSub = list[Math.floor(Math.random() * list.length)];
            
            const response = await axios.get(`https://meme-api.com/gimme/${randomSub}`);
            if (response.data.code) throw new Error('API Error');
            
            // Skip if image is too small/bad quality
            if (response.data.ups < 10) throw new Error('Low Quality');

            url = response.data.url;
            source = `r/${response.data.subreddit}`;
        }
    }

    // FINAL CHECK: Duplicate & Video
    if (history.has(url)) throw new Error('Duplicate'); // Trigger retry
    
    // Add to history
    history.add(url);
    if (history.size > 200) history.clear(); // Larger memory

    if (url.includes('.mp4') || url.includes('.gif') || url.includes('webm')) isVideo = true;

    return { url, source, isVideo };
}

// ---------------------------------------------------------
// 🎮 INTERACTION HANDLER
// ---------------------------------------------------------
client.on('interactionCreate', async interaction => {
    
    // BUTTONS
    if (interaction.isButton()) {
        const [action, cat, tag] = interaction.customId.split(':');

        if (action === 'delete') {
            if (interaction.user.id !== ADMIN_ID) return interaction.reply({ content: '⛔ Admin Only', ephemeral: true });
            return interaction.message.delete();
        }

        if (action === 'dm') {
            await interaction.deferReply({ ephemeral: true });
            try {
                // Try to find the URL in the message
                let url = interaction.message.content;
                // If content is just text, look in embeds
                if (!url || !url.includes('http')) {
                    url = interaction.message.embeds[0]?.image?.url || "Error finding image";
                }
                await interaction.user.send(`**Saved Content:**\n${url}`);
                await interaction.editReply('✅ Check your DMs!');
            } catch (e) {
                await interaction.editReply('❌ I cannot DM you. Open your privacy settings.');
            }
            return;
        }

        if (action === 'next') {
            // Important: Defer Update prevents "Interaction Failed"
            // But we want a NEW message usually.
            await interaction.deferReply(); 
            const actualTag = tag === 'null' ? null : tag;
            await sendContent(interaction, cat, actualTag, false);
            return;
        }
    }

    // COMMANDS
    if (!interaction.isCommand()) return;

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
        return interaction.reply({ content: '🔋 **System Refilled.**', ephemeral: true });
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
            message.reply('✅ **Auto-Post Started:** Posting randomly every 30s.');
            
            const cats = ['real', 'hentai', 'video', 'ass', 'boobs', 'cosplay'];
            
            autoPostInterval = setInterval(async () => {
                const randomCat = cats[Math.floor(Math.random() * cats.length)];
                const channel = await client.channels.fetch(CHANNEL_ID);
                // "True" for isAutoPost -> Silently fail if error
                await sendContent(channel, randomCat, null, true, true);
            }, 30000);
        } 
        else {
            clearInterval(autoPostInterval);
            message.reply('🛑 Auto-Post Stopped.');
        }
    }

    // SHORTCUTS ($real, $hentai, etc)
    if (REPOSITORIES[command] || command === 'trap' || command === 'yuri') {
        await sendContent(message, command, null, true, false);
    }
    else if (command !== 'autopost' && command !== 'refill') {
        // Custom search ($overwatch)
        await sendContent(message, 'custom', command, true, false);
    }
});

// ---------------------------------------------------------
// 📤 SENDER LOGIC
// ---------------------------------------------------------
async function sendContent(context, category, search, isPrefix, isAutoPost) {
    // 1. Loading State
    if (!isPrefix && !isAutoPost && context.deferReply) await context.deferReply();

    // 2. Fetch
    const data = await fetchContent(category, search);

    // 3. Error Handling
    if (!data) {
        // If AutoPost fails, say nothing. Don't spam error.
        if (isAutoPost) return; 
        
        const err = '⚠️ **Traffic High:** All sources busy. Click "Next" or try again.';
        if (isPrefix || context.send) { if(context.send) context.send(err); return; }
        return context.editReply(err);
    }

    // 4. Buttons
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

    // 5. Build Payload
    const footer = `Category: ${category} | Source: ${data.source}`;
    let payload = {};

    if (data.isVideo) {
        payload = { content: `🎥 **Video Found:**\n${data.url}\n*${footer}*`, components: [row] };
    } else {
        const embed = new EmbedBuilder()
            .setImage(data.url)
            .setColor(0xE91E63)
            .setFooter({ text: footer });
        payload = { embeds: [embed], components: [row] };
    }

    // 6. Send
    if (isPrefix || isAutoPost) return context.send(payload);
    return context.editReply(payload);
}

client.login(process.env.DISCORD_TOKEN);
