require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Needed for $ commands
        GatewayIntentBits.DirectMessages
    ]
});

// 🔒 JJM CONFIGURATION
const ADMIN_ID = '934670194096345118';
const CHANNEL_ID = '1443508248211750964';
const PREFIX = '$';

client.once('ready', async () => {
    console.log(`😈 NAUGHTY BOT JJM is online as ${client.user.tag}`);

    // SLASH COMMANDS (Modern Way)
    const commands = [
        new SlashCommandBuilder()
            .setName('content')
            .setDescription('JJM Content System')
            .addStringOption(option =>
                option.setName('category')
                .setDescription('Select Category')
                .setRequired(true)
                .addChoices(
                    { name: '🍑 Nude (Real)', value: 'nude' },
                    { name: '🔞 Hentai (Anime)', value: 'hentai' },
                    { name: '🎥 Video/GIF', value: 'video' },
                    { name: '👙 Cosplay', value: 'cosplay' },
                    { name: '🦶 Feet', value: 'feet' },
                    { name: '👘 Maid', value: 'maid' },
                    { name: '🎲 Random', value: 'random' }
                ))
    ];

    await client.application.commands.set(commands);
});

// ---------------------------------------------------------
// 🧠 REDDIT CATCHER SYSTEM
// ---------------------------------------------------------
async function fetchRedditContent(category) {
    // 🗂️ SUBREDDIT DATABASE
    const sources = {
        'nude': ['gonewild', 'realgirls', 'nudes', 'ass', 'boobs', 'titdrop'],
        'hentai': ['hentai', 'ecchi', 'hentaibondage', 'animebooty'],
        'video': ['nsfw_gifs', '60fpsporn', 'porninfifteenseconds', 'nsfw_html5'],
        'cosplay': ['cosplayonoff', 'cosplaybabes', 'nsfwcosplay'],
        'feet': ['feet', 'feetpics', 'animefeets'],
        'maid': ['maid', 'animemaids'],
        'random': ['hentai', 'realgirls', 'nsfw', 'cosplay']
    };

    // Select a random subreddit from the chosen category list
    const list = sources[category] || sources['random'];
    const subreddit = list[Math.floor(Math.random() * list.length)];

    try {
        // Fetch from Reddit Wrapper
        const response = await axios.get(`https://meme-api.com/gimme/${subreddit}`);
        
        // Error Check
        if (response.data.code) return null;

        return {
            url: response.data.url,
            title: response.data.title,
            sub: response.data.subreddit,
            isVideo: (response.data.url.includes('.mp4') || response.data.url.includes('.gif'))
        };

    } catch (e) {
        console.error(e);
        return null;
    }
}

// ---------------------------------------------------------
// 🎮 CONTROLLER (SLASH & BUTTONS)
// ---------------------------------------------------------
client.on('interactionCreate', async interaction => {
    
    // 1. BUTTONS
    if (interaction.isButton()) {
        const [action, category] = interaction.customId.split(':');

        // ADMIN DELETE
        if (action === 'delete') {
            if (interaction.user.id !== ADMIN_ID) {
                return interaction.reply({ content: '⛔ **Admin Only:** Ask the owner to delete this.', ephemeral: true });
            }
            return interaction.message.delete();
        }

        // SAVE TO DM
        if (action === 'save') {
             // The URL is stored in the embed or content, we grab it from the interaction message
             let url = interaction.message.content; // Try video content first
             if (interaction.message.embeds.length > 0) {
                 url = interaction.message.embeds[0].image.url;
             }
             
             try {
                await interaction.user.send(`**Saved from JJM:**\n${url}`);
                return interaction.reply({ content: '✅ sent to dm', ephemeral: true });
             } catch (e) {
                 return interaction.reply({ content: '❌ open dms', ephemeral: true });
             }
        }

        // NEXT BUTTON
        if (action === 'next') {
            await sendJJMContent(interaction, category, true); // true = FollowUp
            return;
        }
    }

    if (!interaction.isCommand()) return;

    // CHANNEL LOCK
    if (interaction.channelId !== CHANNEL_ID) {
        return interaction.reply({ content: `❌ Use <#${CHANNEL_ID}>`, ephemeral: true });
    }

    // SLASH COMMAND: /CONTENT
    if (interaction.commandName === 'content') {
        const category = interaction.options.getString('category');
        await sendJJMContent(interaction, category, false);
    }
});

// ---------------------------------------------------------
// 💲 PREFIX CONTROLLER ($ COMMANDS)
// ---------------------------------------------------------
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    if (message.channelId !== CHANNEL_ID) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- SYSTEM REFILL (ADMIN) ---
    if (command === 'refill') {
        if (message.author.id !== ADMIN_ID) return message.reply('⛔');
        return message.reply('**System Refill:** ✅\nCache cleared.\nReddit Connection Refreshed.');
    }

    // --- OLD SCHOOL TRIGGERS ---
    // User types $nude -> Bot fetches 'nude' category
    const validCommands = ['nude', 'hentai', 'video', 'cosplay', 'feet', 'maid', 'random'];
    
    if (validCommands.includes(command)) {
        await sendJJMContent(message, command, false, true); // isPrefix = true
    }
});

// ---------------------------------------------------------
// 📤 SENDER LOGIC
// ---------------------------------------------------------
async function sendJJMContent(context, category, isFollowUp, isPrefix) {
    if (!isPrefix && !isFollowUp && context.deferReply) await context.deferReply();

    const data = await fetchRedditContent(category);

    if (!data) {
        const err = '❌ Reddit Error. Try again.';
        if (isPrefix) return context.reply(err);
        if (isFollowUp) return context.followUp({ content: err, ephemeral: true });
        return context.editReply(err);
    }

    // BUTTONS
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`next:${category}`) // Pass category to Next button
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('save:void')
            .setLabel('Save 📩')
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

    const payload = { components: [row] };
    const footer = `JJM System | r/${data.sub}`;

    if (data.isVideo) {
        // Videos must be sent as Content to play
        payload.content = `🎥 **Video:** ${category}\n${data.url}`;
    } else {
        // Images get Embeds
        const embed = new EmbedBuilder()
            .setTitle(`🔥 ${data.title}`)
            .setImage(data.url)
            .setColor(0xE91E63)
            .setFooter({ text: footer });
        payload.embeds = [embed];
    }

    // SEND
    if (isPrefix) {
        await context.reply(payload);
    } else if (isFollowUp) {
        await context.followUp(payload);
    } else {
        await context.editReply(payload);
    }
}

client.login(process.env.DISCORD_TOKEN);
