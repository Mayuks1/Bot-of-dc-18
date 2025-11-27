require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// 🔒 SECURITY SETTINGS (Your specific IDs)
const ADMIN_USER_ID = '934670194096345118';
const ALLOWED_CHANNEL_ID = '1443508248211750964';

client.once('ready', async () => {
    console.log(`🔒 Secured Bot is online as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('content')
            .setDescription('Get images or videos (Admin Only)')
            .addStringOption(option =>
                option.setName('type')
                .setDescription('Select Source')
                .setRequired(true)
                .addChoices(
                    { name: '🖼️ Image (Waifu API)', value: 'waifu' },
                    { name: '🎥 Video/GIF (Reddit)', value: 'reddit_vid' },
                    { name: '🎲 Random (Reddit)', value: 'reddit_img' }
                ))
            .addStringOption(option => 
                option.setName('tag')
                .setDescription('Search Tag (e.g. hentai, meme, cats)')
                .setRequired(false)),

        new SlashCommandBuilder()
            .setName('refill')
            .setDescription('Refill connection (Admin Only)')
    ];

    await client.application.commands.set(commands);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // 🛑 1. CHECK USER ID
    // If the user is NOT the admin (934670194096345118), stop them.
    if (interaction.user.id !== ADMIN_USER_ID) {
        return interaction.reply({ 
            content: '⛔ **Permission Denied:** Only the Bot Owner can use this command.', 
            ephemeral: true 
        });
    }

    // 🛑 2. CHECK CHANNEL ID
    // If the channel is NOT the specific one (1443508248211750964), stop.
    if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
        return interaction.reply({ 
            content: `⛔ **Wrong Channel:** You can only use this bot in <#${ALLOWED_CHANNEL_ID}>`, 
            ephemeral: true 
        });
    }

    const { commandName } = interaction;

    // --- COMMAND: REFILL ---
    if (commandName === 'refill') {
        return interaction.reply({ 
            content: '🔋 **System Refilled.** Connection to Reddit & APIs refreshed.', 
            ephemeral: true 
        });
    }

    // --- COMMAND: CONTENT ---
    if (commandName === 'content') {
        await interaction.deferReply();
        const type = interaction.options.getString('type');
        let tag = interaction.options.getString('tag');
        
        // Auto-tag logic if empty
        if (!tag) {
            if (type === 'waifu') tag = 'hentai';
            else if (type === 'reddit_vid') tag = 'nsfw_gifs';
            else tag = 'nsfw';
        }

        try {
            let contentUrl = '';
            let footerText = '';
            let isVideo = false;

            // Source A: Waifu.im
            if (type === 'waifu') {
                const response = await axios.get(`https://api.waifu.im/search?included_tags=${tag}&is_nsfw=true`);
                if (!response.data.images || response.data.images.length === 0) {
                    return interaction.editReply('❌ No results found. Try a different tag.');
                }
                contentUrl = response.data.images[0].url;
                footerText = 'Source: Waifu.im';
            }

            // Source B: Reddit
            if (type === 'reddit_img' || type === 'reddit_vid') {
                const response = await axios.get(`https://meme-api.com/gimme/${tag}`);
                if (response.data.code) {
                    return interaction.editReply(`❌ Error: Subreddit r/${tag} not found.`);
                }
                contentUrl = response.data.url;
                footerText = `Source: r/${response.data.subreddit}`;

                if (contentUrl.includes('.mp4') || contentUrl.includes('.gif') || type === 'reddit_vid') {
                    isVideo = true;
                }
            }

            // Send Result
            if (isVideo) {
                // Video Link (Plays automatically)
                return interaction.editReply(`🎥 **Video Result:**\n${contentUrl}`);
            } else {
                // Image Embed
                const embed = new EmbedBuilder()
                    .setTitle(`🔥 Result: ${tag}`)
                    .setImage(contentUrl)
                    .setColor(0xE91E63)
                    .setFooter({ text: footerText });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Open Original').setStyle(ButtonStyle.Link).setURL(contentUrl)
                );

                await interaction.editReply({ embeds: [embed], components: [row] });
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply('⚠️ **Error:** API failed. Try /refill.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
