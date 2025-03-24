require("dotenv").config();

module.exports = {
    BOT_TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_API_ENDPOINT: process.env.GEMINI_API_ENDPOINT,
    PORT: process.env.PORT || 3000,
};
