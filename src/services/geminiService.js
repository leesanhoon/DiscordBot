const { GEMINI_API_KEY } = require("../config/env");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const { AttachmentBuilder } = require("discord.js");

const generateContent = async (message) => {
    const result = await model.generateContent(message);
    return result.response.text();
};

const generateImage = async (message, msg) => {
    // Set responseModalities to include "Image" so the model can generate  an image
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp-image-generation",
        generationConfig: {
            responseModalities: ["Text", "Image"],
        },
    });

    try {
        const response = await model.generateContent(message);
        for (const part of response.response.candidates[0].content.parts) {
            // Based on the part type, either show the text or save the image
            if (part.text) {
                return await msg.reply(
                    "Tôi bị cụt không vẽ được hình đâu hihi"
                );
            } else if (part.inlineData) {
                const imageData = part.inlineData.data;
                const buffer = Buffer.from(imageData, "base64");
                const attachment = new AttachmentBuilder(buffer, {
                    name: "native-image.png",
                });
                await msg.reply({ files: [attachment] });
            }
        }
    } catch (error) {
        console.error("Error generating content:", error);
    }
};

module.exports = { generateContent, generateImage };
