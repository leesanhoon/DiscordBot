require("dotenv").config();
const Discord = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { AttachmentBuilder } = require("discord.js");

// Environment variables
const { DISCORD_TOKEN, GEMINI_API_KEY } = require("./config/env");

// Model configurations
const MODELS = {
  TEXT: {
    name: "gemini-2.0-flash",
    config: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseModalities: ["Text"],
    },
  },
  VISION: {
    name: "gemini-2.0-flash-exp-image-generation",
    config: {
      temperature: 0.4,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 2048,
      responseModalities: ["Text", "Image"],
    },
  },
  CREATIVE: {
    name: "gemini-2.0-flash-exp-image-generation",
    config: {
      temperature: 0.9,
      topK: 50,
      topP: 1.0,
      maxOutputTokens: 8192,
      responseModalities: ["Text", "Image"],
    },
  },
  ANALYSIS: {
    name: "gemini-2.0-flash-exp-image-generation",
    config: {
      temperature: 0.3,
      topK: 20,
      topP: 0.7,
      maxOutputTokens: 16384,
      responseModalities: ["Text"],
    },
  },
};

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

// Optimized message handling with Gemini AI
const generateContent = async (message, msg) => {
  const messageType = detectMessageType(message);
  const modelConfig = MODELS[messageType];

  const model = genAI.getGenerativeModel({
    model: modelConfig.name,
    generationConfig: modelConfig.config,
  });

  // Customize prompt based on message type
  const getPrompt = (type, message) => {
    const prompts = {
      VISION: `Hãy phân tích hình ảnh sau một cách chi tiết và chính xác, nhưng đừng quên thêm chút hài hước: `,
      CREATIVE: `Hãy sáng tạo nội dung với giọng điệu vui vẻ, hài hước nhưng vẫn đảm bảo thông tin chính xác: `,
      ANALYSIS: `Hãy phân tích vấn đề một cách rõ ràng, chính xác và thêm chút dí dỏm để dễ hiểu hơn: `,
      TEXT: `Hãy trả lời câu hỏi với thông tin chính xác, giọng điệu vui vẻ và hài hước: `,
    };
    return prompts[type] + message;
  };

  try {
    const prompt = getPrompt(messageType, message);
    const content = [];

    // Xử lý hình ảnh trong VISION mode
    if (messageType === "VISION") {
      const isImageGeneration =
        message.toLowerCase().includes("tạo") &&
        message.toLowerCase().includes("hình");

      if (!isImageGeneration && msg.attachments.size > 0) {
        const validImageTypes = ["image/jpeg", "image/png", "image/gif"];
        const imageAttachments = [...msg.attachments.values()].filter((att) =>
          validImageTypes.includes(att.contentType)
        );

        if (imageAttachments.length > 0) {
          try {
            const processedImages = await Promise.all(
              imageAttachments.map(async (attachment) => {
                const imageUrl = attachment.url;
                const imageResponse = await fetch(imageUrl);
                if (!imageResponse.ok) {
                  throw new Error(
                    `Không thể tải hình ảnh: ${imageResponse.statusText}`
                  );
                }
                const arrayBuffer = await imageResponse.arrayBuffer();
                return {
                  inlineData: {
                    mimeType: attachment.contentType,
                    data: Buffer.from(arrayBuffer).toString("base64"),
                  },
                };
              })
            );
            content.push(...processedImages);
          } catch (error) {
            console.error("Error processing images:", error);
            return msg.reply(
              "Có lỗi xảy ra khi xử lý hình ảnh. Vui lòng thử lại sau."
            );
          }
        } else {
          return msg.reply(
            "Vui lòng đính kèm file hình ảnh hợp lệ (JPG, PNG, GIF)."
          );
        }
      } else if (!isImageGeneration) {
        return msg.reply("Vui lòng đính kèm hình ảnh để tôi có thể phân tích.");
      }
    }

    content.push({ text: prompt });

    const response = await model.generateContent(content);

    const parts = response.response.candidates[0].content.parts;

    for (const part of parts) {
      if (part.text) {
        // Chunk long messages for Discord's limit
        const maxLength = 2000;
        const chunks = [];
        let currentChunk = "";

        const sentences = part.text.match(/[^.!?]+[.!?]/g) || [part.text]; // Tách theo câu

        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > maxLength) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += sentence;
          }
        }

        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }

        for (let i = 0; i < chunks.length; i++) {
          await msg.reply(chunks[i]);
        }
      } else if (part.inlineData) {
        try {
          const imageData = part.inlineData.data;
          if (!imageData) {
            throw new Error("Dữ liệu hình ảnh không hợp lệ");
          }

          const buffer = Buffer.from(imageData, "base64");
          const attachment = new AttachmentBuilder(buffer, {
            name: "generated-image.png",
            description: "Hình ảnh được tạo bởi Gemini AI",
          });
          await msg.reply({ files: [attachment] });
        } catch (error) {
          console.error("Error processing generated image:", error);
          await msg.reply(
            "Có lỗi xảy ra khi xử lý hình ảnh được tạo. Vui lòng thử lại."
          );
        }
      }
    }
  } catch (error) {
    console.error("Error generating content:", error);
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
