const axios = require("axios");
const { OPENROUTER_API_KEY } = require("../config/env");

const MODELS = {
  TEXT: {
    name: "tencent/hy3:free",
    config: { temperature: 0.7, top_p: 0.95, max_tokens: 4096 },
  },
  VISION: {
    name: "nvidia/nemotron-3-ultra-550b-a55b:free",
    config: { temperature: 0.4, top_p: 0.8, max_tokens: 2048 },
  },
  CREATIVE: {
    name: "nvidia/nemotron-3-ultra-550b-a55b:free",
    config: { temperature: 0.9, top_p: 1.0, max_tokens: 8192 },
  },
  ANALYSIS: {
    name: "tencent/hy3:free",
    config: { temperature: 0.3, top_p: 0.7, max_tokens: 16384 },
  },
};

const PERSONA =
  "Bạn là một con bot Discord tinh nghịch, ăn nói có duyên, hay pha trò và chọc ghẹo nhẹ nhàng với mọi người trong server. " +
  "Nguyên tắc bắt buộc: thông tin đưa ra phải chính xác 100%, không bịa đặt, không đoán mò - nếu không chắc thì nói rõ là không chắc. " +
  "Được phép đùa, chêm meme, emoji, giọng điệu lầy lội, nhưng đùa xong vẫn phải trả lời đúng trọng tâm câu hỏi, không né tránh hay lan man. " +
  "Trả lời ngắn gọn, dùng markdown Discord khi hợp lý (in đậm, gạch đầu dòng), tránh dài dòng không cần thiết.\n\n";

const PROMPTS = {
  VISION:
    PERSONA +
    "Nhiệm vụ: phân tích hình ảnh sau một cách chi tiết, chính xác từng chi tiết quan sát được, rồi buông vài câu bình luận dí dỏm về nó. Hình ảnh/câu hỏi kèm theo: ",
  CREATIVE:
    PERSONA +
    "Nhiệm vụ: sáng tạo nội dung (truyện, thơ, kịch bản, ý tưởng...) theo yêu cầu bên dưới, giữ giọng điệu vui nhộn, sáng tạo thoải mái nhưng không bịa sai kiến thức nền (tên riêng, sự kiện, số liệu... nếu có phải đúng). Yêu cầu: ",
  ANALYSIS:
    PERSONA +
    "Nhiệm vụ: phân tích vấn đề sau một cách rõ ràng, có logic, đi thẳng vào bản chất vấn đề, có thể chia ý bằng gạch đầu dòng. Xen chút dí dỏm để dễ nuốt nhưng không làm loãng nội dung chính. Vấn đề cần phân tích: ",
  TEXT: PERSONA + "Câu hỏi/tin nhắn cần trả lời: ",
};

const getPrompt = (messageType, message) => PROMPTS[messageType] + message;

const buildMessageContent = (prompt, imageParts = []) => {
  if (imageParts.length === 0) return prompt;
  return [{ type: "text", text: prompt }, ...imageParts];
};

const callOpenRouter = async (messageType, content) => {
  const modelConfig = MODELS[messageType];
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: modelConfig.name,
      messages: [{ role: "user", content }],
      ...modelConfig.config,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );
  return response.data.choices[0].message.content;
};

const generateReply = async (messageType, message, imageParts = []) => {
  const prompt = getPrompt(messageType, message);
  const content = buildMessageContent(prompt, imageParts);
  return callOpenRouter(messageType, content);
};

module.exports = {
  MODELS,
  getPrompt,
  buildMessageContent,
  callOpenRouter,
  generateReply,
};
