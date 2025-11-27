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

// 🗂️ MASSIVE SOURCE LIST
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
    boobs: ['boobs', 'tits', 'hugeboobs', 'pokies'],
    trap: ['traphentai', 'traps', 'femboy', 'delicious_traps'], // Added
    yuri: ['yuri', 'wholesomeyuri', 'yurihentai'] // Added
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
            // console.log(`Fetch attempt ${i+1} failed: ${e.message}`);
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
        const rng = Math.random();

        // A. WAIFU.IM
        if ((category === 'hentai' || category === 'maid') && rng > 0.6) {
            try {
                const res = await axios.get(`https://api.waifu.im/search?included_tags=${category === 'maid' ? 'maid' : 'hentai'}&is_nsfw=true`);
                if(res.data.images && res.data.images[0]) {
                    url = res.data.images[0].url;
                    source = 'Waifu.im';
                } else { throw new Error('Waifu.im Empty'); }
            } catch (e) { throw new Error('Waifu API Fail'); }
        }
        // B. NEKOS.BEST
        else if (category === 'hentai' && rng > 0.85) {
             try {
                 const res = await axios.get('https://nekos.best/api/v2/hentai');
                 url = res.data.results[0].url;
                 source = 'Nekos.best';
             } catch (e) { throw new Error('Nekos API Fail'); }
        }
        // C. REDDIT (The Main Engine)
        else {
            const list = REPOSITORIES[category] || ['nsfw']; // Fallback
            const randomSub = list[Math.floor(Math.random() * list.length)];
            
            const response = await axios.get(`https://meme-api.com/gimme/${randomSub}`);
            if (response.data.code || !response.data.url) throw new Error('API Error');
            if (response.data.ups < 10) throw new Error('Low Quality');

            url = response.data.url;
            source = `r/${response.data.subreddit}`;
        }
    }

    if (!url) throw new Error('No URL found');
    if (history.has(url)) throw new Error('Duplicate'); 
    
    history.add(url);
    if (history.size > 200) history.clear();

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
            try { await interaction.message.delete(); } catch(e) {}
            return;
        }

        if (action === 'dm') {
            await interaction.deferReply({ ephemeral: true });
            try {
                let url = interaction.message.content;
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
            // FIX: DO NOT defer here. Let sendContent handle the state.
            const actualTag = tag === 'null' ? null : tag;
            await sendContent(interaction, cat, actualTag); 
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
                try {
                    const randomCat = cats[Math.floor(Math.random() * cats.length)];
                    const channel = await client.channels.fetch(CHANNEL_ID);
                    if(channel) {
                        // isPrefix=true, isAutoPost=true
                        await sendContent(channel, randomCat, null, true, true);
                    }
                } catch (e) {
                    console.error("Autopost Error:", e.message);
                }
            }, 30000); // 30 seconds
        } 
        else {
            if(autoPostInterval) clearInterval(autoPostInterval);
            autoPostInterval = null;
            message.reply('🛑 Auto-Post Stopped.');
        }
    }

    // SHORTCUTS
    if (REPOSITORIES[command] || command === 'trap' || command === 'yuri') {
        await sendContent(message, command, null, true, false);
    }
    else if (command !== 'autopost' && command !== 'refill') {
        await sendContent(message, 'custom', command, true, false);
    }
});

// ---------------------------------------------------------
// 📤 SENDER LOGIC
// ---------------------------------------------------------
async function sendContent(context, category, search, isPrefix = false, isAutoPost = false) {
    
    // 1. Loading State (Fix for Button Loop)
    // Only defer if it's an interaction (Slash or Button) AND hasn't been deferred yet
    if (!isPrefix && !isAutoPost) {
        if (context.isRepliable() && !context.deferred && !context.replied) {
            await context.deferReply();
        }
    }

    // 2. Fetch
    const data = await fetchContent(category, search);

    // 3. Error Handling
    if (!data) {
        if (isAutoPost) {
             console.log("Autopost skipped: No content found.");
             return; 
        }
        
        const err = '⚠️ **Traffic High:** All sources busy. Click "Next" or try again.';
        if (isPrefix || context.send) { 
            // Handle legacy message reply
            if(context.send) context.send(err).catch(e => console.log(e)); 
            return; 
        }
        // Handle Interaction reply
        return context.editReply(err).catch(e => console.log(e));
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
    try {
        if (isPrefix || isAutoPost) {
            return await context.send(payload);
        }
        return await context.editReply(payload);
    } catch (e) {
        console.error("Failed to send message:", e.message);
    }
}

client.login(process.env.DISCORD_TOKEN);
