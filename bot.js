const Discord = require("discord.js");
const axios = require("axios");
require("dotenv").config(); // Để đọc biến môi trường từ .env

const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
    ],
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.BOT_API_KEY;
const GEMINI_API_ENDPOINT = process.env.BOT_API_ENDPOINT;

async function getGeminiResponse(message) {
    const headers = {
        "Content-Type": "application/json",
    };
    const data = {
        contents: [
            {
                parts: [
                    {
                        text: message,
                    },
                ],
            },
        ],
    };
    try {
        const url = `${GEMINI_API_ENDPOINT}?key=${GEMINI_API_KEY}`;
        const response = await axios.post(url, data, { headers });
        let reply =
            response.data.candidates[0].content.parts[0].text ||
            "Tôi bị ngu không trả lời được đâu hihi.";

        return reply;
    } catch (error) {
        console.error("Lỗi khi gọi API AI:", error);
        return "Tôi bị ngu không trả lời dược đâu hihi.";
    }
}

client.on("ready", () => {
    console.log(`Bot đã đăng nhập với tên ${client.user.tag}!`);
});

client.on("messageCreate", async (msg) => {
    if (msg.content.includes(`<@${client.user.id}>`)) {
        const query = msg.content.replace(`<@${client.user.id}>`, "").trim();
        const geminiResponse = await getGeminiResponse(query);
        console.log(geminiResponse);
        msg.reply(geminiResponse);
    }
});

client.login(DISCORD_TOKEN);
