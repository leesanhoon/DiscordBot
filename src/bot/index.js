const Discord = require("discord.js");
const handleMessage = require("./commands");
const { DISCORD_TOKEN } = require("../config/env");

const startBot = () => {
    const client = new Discord.Client({
        intents: [
            Discord.GatewayIntentBits.Guilds,
            Discord.GatewayIntentBits.GuildMessages,
            Discord.GatewayIntentBits.MessageContent,
        ],
    });

    client.on("ready", () => {
        console.log(`Bot đã đăng nhập với tên ${client.user.tag}!`);
    });

    client.on("messageCreate", async (msg) => {
        await handleMessage(client, msg);
    });

    client.login(DISCORD_TOKEN).catch((error) => {
        console.error("Lỗi khi đăng nhập bot:", error);
    });
};

module.exports = startBot;
