const axios = require("axios");
const { OPENROUTER_API_KEY } = require("../config/env");

const MODELS = {
  TEXT: {
    name: "meta-llama/llama-3.3-70b-instruct:free",
    config: { temperature: 0.7, top_p: 0.95, max_tokens: 4096 },
  },
  VISION: {
    name: "google/gemma-4-31b-it:free",
    config: { temperature: 0.4, top_p: 0.8, max_tokens: 2048 },
  },
  CREATIVE: {
    name: "nousresearch/hermes-3-llama-3.1-405b:free",
    config: { temperature: 0.9, top_p: 1.0, max_tokens: 8192 },
  },
  ANALYSIS: {
    name: "qwen/qwen3-next-80b-a3b-instruct:free",
    config: { temperature: 0.3, top_p: 0.7, max_tokens: 16384 },
  },
};

const PROMPTS = {
  VISION:
    "Hãy phân tích hình ảnh sau một cách chi tiết và chính xác, nhưng đừng quên thêm chút hài hước: ",
  CREATIVE:
    "Hãy sáng tạo nội dung với giọng điệu vui vẻ, hài hước nhưng vẫn đảm bảo thông tin chính xác: ",
  ANALYSIS:
    "Hãy phân tích vấn đề một cách rõ ràng, chính xác và thêm chút dí dỏm để dễ hiểu hơn: ",
  TEXT: "Hãy trả lời câu hỏi với thông tin chính xác, giọng điệu vui vẻ và hài hước: ",
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
    }
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
