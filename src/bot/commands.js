const { generateContent, generateImage } = require("../services/geminiService");

const handleMessage = async (client, msg) => {
    if (!msg.content.includes(`<@${client.user.id}>`)) return;

    const query = msg.content.replace(`<@${client.user.id}>`, "").trim();

    try {
        await generateImage(query, msg);
        // const maxLength = 2000;
        // for (let i = 0; i < geminiResponse.length; i += maxLength) {
        //     const replyChunk = geminiResponse.substring(i, i + maxLength);
        //     await msg.reply(replyChunk);
        // }
    } catch (error) {
        console.error("An error occurred while processing the request", error);
        msg.reply("Tôi bị ngu không trả lời được");
    }
};

module.exports = handleMessage;
