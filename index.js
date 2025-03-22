const express = require("express");
const Discord = require("discord.js");
const axios = require("axios");
require("dotenv").config(); // Để đọc biến môi trường từ .env

const app = express();
const port = process.env.PORT || 3000;

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
        console.error("Tôi bị ngu không trả lời dược đâu hihi.", error);
        return "Tôi bị ngu không trả lời dược đâu hihi.";
    }
}

client.on("ready", () => {
    console.log(`Bot đã đăng nhập với tên ${client.user.tag}!`);
});

client.on("messageCreate", async (msg) => {
    if (
        msg.content.includes(`<@${client.user.id}>`) ||
        msg.content.includes("!kun")
    ) {
        const query = msg.content.replace(`<@${client.user.id}>`, "").trim();
        try {
            const geminiResponse = await getGeminiResponse(query);
            console.log(geminiResponse);
            const maxLength = 2000;
            for (let i = 0; i < geminiResponse.length; i += maxLength) {
                const replyChunk = geminiResponse.substring(i, i + maxLength);
                await msg.reply(replyChunk);
            }
        } catch (error) {
            console.error("Tôi bị ngu không trả lời dược đâu hihi", error);
            msg.reply("Tôi bị ngu không trả lời dược đâu hihi");
        }
    }
});

client.login(DISCORD_TOKEN).catch((error) => {
    console.error("Lỗi khi đăng nhập bot:", error);
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).send("Bot is running");
});

// Start the Express server
app.get("/", (req, res) => {
    res.send("Discord bot is running");
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Export the Express app for Vercel
module.exports = app;
