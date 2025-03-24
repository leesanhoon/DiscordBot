const axios = require("axios");
const { GEMINI_API_KEY, GEMINI_API_ENDPOINT } = require("../config/env");

const getGeminiResponse = async (message) => {
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
        console.error("Tôi bị ngu không trả lời được đâu hihi.", error);
        return "Tôi bị ngu không trả lời được đâu hihi.";
    }
};

module.exports = { getGeminiResponse };
