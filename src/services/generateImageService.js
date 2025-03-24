const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const { GEMINI_API_KEY } = require("../config/env");
const { MessageAttachment } = require("discord.js");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function generateImage(message) {
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
                console.log(part.text);
                return part.text;
            } else if (part.inlineData) {
                const imageData = part.inlineData.data;
                const buffer = Buffer.from(imageData, "base64");
                const attachment = new MessageAttachment(
                    buffer,
                    "native-image.png"
                );
                console.log("Image generated and ready to be sent to Discord");
                return attachment;
            }
        }
    } catch (error) {
        console.error("Error generating content:", error);
    }
}

// module.exports = { generateImage };
