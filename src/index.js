require("dotenv").config();
const Discord = require("discord.js");

const { DISCORD_TOKEN } = require("./config/env");
const { generateReply } = require("./ai/openrouter");
const { buildVisionContent } = require("./ai/buildVisionContent");
const { chunkMessage } = require("./ai/chunkMessage");

// Determine message type and select appropriate model
const detectMessageType = (message, hasAttachments = false) => {
  // Ảnh đính kèm là tín hiệu chắc chắn nhất, ưu tiên hơn mọi từ khóa trong text
  if (hasAttachments) return "VISION";

  const patterns = {
    VISION: /\b(xem ảnh|nhìn ảnh|phân tích ảnh|hình ảnh này|bức ảnh|tấm ảnh|cái ảnh|image|picture|photo)\b/i,
    ANALYSIS: /\b(phân tích|so sánh|compare|analyze|tổng hợp|thống kê|đánh giá|review)\b/i,
    CREATIVE: /\b(viết (truyện|thơ|bài|kịch bản|lời|đoạn)|sáng tác|làm thơ|compose|write (a|an|me) )\b/i,
  };

  if (patterns.VISION.test(message)) return "VISION";
  if (patterns.ANALYSIS.test(message)) return "ANALYSIS";
  if (patterns.CREATIVE.test(message)) return "CREATIVE";
  return "TEXT"; // Default to text model
};

const MAX_REPLY_HISTORY = 3;

const messageToHistoryEntry = (message, client) => ({
  role: message.author.id === client.user.id ? "assistant" : "user",
  content:
    message.content ||
    (message.attachments.size > 0 ? "[hình ảnh]" : "[tin nhắn trống]"),
});

const getReplyContext = async (msg, client) => {
  const history = [];
  const channel = msg.channel;
  let current = msg;
  let isReplyToBot = false;

  for (let i = 0; i < MAX_REPLY_HISTORY; i++) {
    if (!current.reference?.messageId) break;

    let fetched;
    try {
      fetched = await channel.messages.fetch(current.reference.messageId);
    } catch (error) {
      break;
    }

    if (i === 0) {
      isReplyToBot = fetched.author.id === client.user.id;
    }

    history.unshift(messageToHistoryEntry(fetched, client));
    current = fetched;
  }

  return { isReplyToBot, history };
};

// Optimized message handling with OpenRouter
const generateContent = async (message, msg, history = []) => {
  const messageType = detectMessageType(message, msg.attachments.size > 0);

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

    const reply = await generateReply(messageType, message, imageParts, history);
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
  const hasMention = msg.content.includes(`<@${client.user.id}>`);
  const replyContext = await getReplyContext(msg, client);

  if (!hasMention && !replyContext.isReplyToBot) return;

  const query = msg.content.replace(`<@${client.user.id}>`, "").trim();
  if (!query) {
    msg.reply("Xin chào! Tôi có thể giúp gì cho bạn?");
    return;
  }

  try {
    await generateContent(query, msg, replyContext.history);
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
if (require.main === module) {
  startBot();
}

module.exports = {
  detectMessageType,
  getReplyContext,
  generateContent,
  handleMessage,
  startBot,
};
