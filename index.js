require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    console.log(`😈 Content Bot is online as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('content')
            .setDescription('Get content (Images/Videos)')
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
                .setDescription('Search Tag (e.g. hentai, meme, cats, realgirls)')
                .setRequired(false)),

        new SlashCommandBuilder()
            .setName('refill')
            .setDescription('Refill connection and clear cache')
    ];

    await client.application.commands.set(commands);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // 🔒 SAFETY CHECK: Bot only works in NSFW channels
    if (!interaction.channel.nsfw) {
        return interaction.reply({ 
            content: '❌ **Restricted:** Use this command in an **Age-Restricted (NSFW)** channel only.', 
            ephemeral: true 
        });
    }

    const { commandName } = interaction;

    if (commandName === 'refill') {
        return interaction.reply({ 
            content: '🔋 **System Refilled.** Connection to Reddit & APIs refreshed.', 
            ephemeral: true 
        });
    }

    if (commandName === 'content') {
        await interaction.deferReply();
        const type = interaction.options.getString('type');
        // Default tag logic
        let tag = interaction.options.getString('tag');
        if (!tag) {
            if (type === 'waifu') tag = 'hentai';
            else if (type === 'reddit_vid') tag = 'nsfw_gifs';
            else tag = 'nsfw';
        }

        try {
            let contentUrl = '';
            let footerText = '';
            let isVideo = false;

            // 1. Waifu.im API (Images)
            if (type === 'waifu') {
                const response = await axios.get(`https://api.waifu.im/search?included_tags=${tag}&is_nsfw=true`);
                if (!response.data.images || response.data.images.length === 0) {
                    return interaction.editReply('❌ No results found. Try a different tag (e.g., maid, waifu, hentai).');
                }
                contentUrl = response.data.images[0].url;
                footerText = 'Source: Waifu.im';
            }

            // 2. Reddit API (Videos/Images)
            if (type === 'reddit_img' || type === 'reddit_vid') {
                const response = await axios.get(`https://meme-api.com/gimme/${tag}`);
                if (response.data.code) {
                    return interaction.editReply(`❌ Error: Subreddit r/${tag} not found or is private.`);
                }
                contentUrl = response.data.url;
                footerText = `Source: r/${response.data.subreddit}`;

                // Detect Video/GIF
                if (contentUrl.includes('.mp4') || contentUrl.includes('.gif') || type === 'reddit_vid') {
                    isVideo = true;
                }
            }

            // Send Result
            if (isVideo) {
                // Videos are sent as plain links so Discord plays them automatically
                return interaction.editReply(`🎥 **Video Result:**\n${contentUrl}`);
            } else {
                // Images get a nice Embed
                const embed = new EmbedBuilder()
                    .setTitle(`🔥 Result: ${tag}`)
                    .setImage(contentUrl)
                    .setColor(0xE91E63) // Pink
                    .setFooter({ text: footerText });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Open Original').setStyle(ButtonStyle.Link).setURL(contentUrl)
                );

                await interaction.editReply({ embeds: [embed], components: [row] });
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply('⚠️ **Error:** Could not find content. Check your tag or try /refill.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
