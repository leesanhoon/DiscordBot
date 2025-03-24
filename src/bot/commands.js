const { generateContent, generateImage } = require("../services/geminiService");

const handleMessage = async (client, msg) => {
    if (msg.content.includes(`<@${client.user.id}>`)) {
        if (msg.content.includes("!img")) {
            const query = msg.content
                .replace(`<@${client.user.id}>`, "")
                .replace("!img", "")
                .trim();
            try {
                await generateImage(query, msg);
            } catch (error) {
                console.error("Tôi bị ngu không trả lời dược đâu hihi", error);
                msg.reply("Tôi bị ngu không trả lời dược đâu hihi");
            }
        } else {
            const query = msg.content
                .replace(`<@${client.user.id}>`, "")
                .trim();
            try {
                const geminiResponse = await generateContent(query);
                const maxLength = 2000;
                for (let i = 0; i < geminiResponse.length; i += maxLength) {
                    const replyChunk = geminiResponse.substring(
                        i,
                        i + maxLength
                    );
                    await msg.reply(replyChunk);
                }
            } catch (error) {
                console.error("Tôi bị ngu không trả lời dược đâu hihi", error);
                msg.reply("Tôi bị ngu không trả lời dược đâu hihi");
            }
        }
    }
};

module.exports = handleMessage;
