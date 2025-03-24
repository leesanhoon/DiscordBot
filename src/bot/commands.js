const { getGeminiResponse } = require("../services/geminiService");
// const { createImage } = require("../services/imageService");

const handleMessage = async (client, msg) => {
    if (msg.content.includes(`<@${client.user.id}>`)) {
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
};

module.exports = handleMessage;
