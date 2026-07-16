require("dotenv").config();
const Discord = require("discord.js");

const { DISCORD_TOKEN } = require("./config/env");
const { generateReply } = require("./ai/openrouter");
const { buildVisionContent } = require("./ai/buildVisionContent");
const { chunkMessage } = require("./ai/chunkMessage");

// Determine message type and select appropriate model
const detectMessageType = (message) => {
  const patterns = {
    VISION: /(xem|nhìn|hình ảnh|ảnh|image|picture|photo)/i,
    CREATIVE: /(viết|sáng tác|content|tạo|create|write|compose)/i,
    ANALYSIS: /(phân tích|analyze|compare|tổng hợp|thống kê|đánh giá|review)/i,
  };

  if (patterns.VISION.test(message)) return "VISION";
  if (patterns.CREATIVE.test(message)) return "CREATIVE";
  if (patterns.ANALYSIS.test(message)) return "ANALYSIS";
  return "TEXT"; // Default to text model
};

// Optimized message handling with OpenRouter
const generateContent = async (message, msg) => {
  const messageType = detectMessageType(message);

  try {
    let imageParts = [];

    if (messageType === "VISION") {
      if (msg.attachments.size === 0) {
        return msg.reply(
          "Vui lòng đính kèm hình ảnh để tôi có thể phân tích."
        );
      }

      const attachments = [...msg.attachments.values()];
      imageParts = await buildVisionContent(attachments);

      if (imageParts.length === 0) {
        return msg.reply(
          "Vui lòng đính kèm file hình ảnh hợp lệ (JPG, PNG, GIF)."
        );
      }
    }

    const reply = await generateReply(messageType, message, imageParts);
    const chunks = chunkMessage(reply);

    for (const chunk of chunks) {
      await msg.reply(chunk);
    }
  } catch (error) {
    console.error(
      "Error generating content:",
      error.response?.status,
      error.response?.data || error.message
    );
    msg.reply(
      "Xin lỗi, tôi gặp vấn đề khi xử lý yêu cầu của bạn. Vui lòng thử lại sau."
    );
  }
};

// Simplified message handling
const handleMessage = async (client, msg) => {
  if (!msg.content.includes(`<@${client.user.id}>`)) return;

  const query = msg.content.replace(`<@${client.user.id}>`, "").trim();
  if (!query) {
    msg.reply("Xin chào! Tôi có thể giúp gì cho bạn?");
    return;
  }

  try {
    await generateContent(query, msg);
  } catch (error) {
    console.error("Message handling error:", error);
    msg.reply("Đã xảy ra lỗi không mong muốn. Vui lòng thử lại sau.");
  }
};

// Discord bot setup
const startBot = () => {
  const client = new Discord.Client({
    intents: [
      Discord.GatewayIntentBits.Guilds,
      Discord.GatewayIntentBits.GuildMessages,
      Discord.GatewayIntentBits.MessageContent,
    ],
  });

  client.on("ready", () => {
    console.log(`Bot đã sẵn sàng với tên ${client.user.tag}`);
  });

  client.on("messageCreate", async (msg) => {
    await handleMessage(client, msg);
  });

  client.login(DISCORD_TOKEN).catch((error) => {
    console.error("Lỗi đăng nhập Discord:", error);
  });
};

// Start the bot
startBot();
