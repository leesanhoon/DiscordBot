const { generateContent } = require("../services/geminiService");

const handleMessage = async (client, msg) => {
    if (!msg.content.includes(`<@${client.user.id}>`)) return;

    const query = msg.content.replace(`<@${client.user.id}>`, "").trim();

    try {
        await generateContent(query, msg);
    } catch (error) {
        console.error("An error occurred while processing the request", error);
        msg.reply("Tôi bị ngu không trả lời được");
    }
};

module.exports = handleMessage;
