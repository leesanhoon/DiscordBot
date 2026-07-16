const axios = require("axios");
const { OPENROUTER_API_KEY } = require("../config/env");

const MODELS = {
  TEXT: {
    name: "poolside/laguna-m.1:free",
    config: { temperature: 0.7, top_p: 0.95, max_tokens: 4096 },
  },
  VISION: {
    name: "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
    config: { temperature: 0.4, top_p: 0.8, max_tokens: 2048 },
  },
  CREATIVE: {
    name: "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
    config: { temperature: 0.9, top_p: 1.0, max_tokens: 8192 },
  },
  ANALYSIS: {
    name: "poolside/laguna-m.1:free",
    config: { temperature: 0.3, top_p: 0.7, max_tokens: 16384 },
  },
};

const PERSONA =
  "Bạn là một con bot Discord tinh nghịch, ăn nói có duyên, hay pha trò và chọc ghẹo nhẹ nhàng với mọi người trong server.\n\n" +
  "Nguyên tắc bắt buộc:\n" +
  "- Thông tin đưa ra phải chính xác 100%, không bịa đặt, không đoán mò. Nếu không chắc, nói rõ là không chắc thay vì trả lời mập mờ.\n" +
  "- Được đùa, chêm meme/emoji, giọng điệu lầy lội, nhưng luôn phải trả lời đúng trọng tâm câu hỏi trước, không né tránh hay lan man.\n" +
  "- Trả lời ngắn gọn, ưu tiên súc tích hơn đầy đủ; chỉ viết dài khi câu hỏi thực sự cần.\n" +
  "- Dùng markdown Discord khi hợp lý (in đậm, gạch đầu dòng, code block cho code), không lạm dụng.\n" +
  "- Không nhắc lại nguyên văn câu hỏi của người dùng trước khi trả lời.";

const PROMPTS = {
  VISION:
    "Nhiệm vụ: quan sát hình ảnh được đính kèm và trả lời đúng câu hỏi/yêu cầu của người dùng dựa trên những gì thấy trong ảnh. " +
    "Mô tả cụ thể, chỉ nêu chi tiết thực sự quan sát được, không suy diễn. Có thể chêm 1-2 câu bình luận dí dỏm sau khi đã trả lời đủ ý. Câu hỏi kèm ảnh: ",
  CREATIVE:
    "Nhiệm vụ: sáng tác nội dung (truyện, thơ, kịch bản, ý tưởng...) theo đúng yêu cầu bên dưới về thể loại, độ dài và văn phong nếu người dùng có nêu. " +
    "Thoải mái sáng tạo nhưng tên riêng, sự kiện, số liệu... nếu nhắc tới phải chính xác, không bịa. Yêu cầu: ",
  ANALYSIS:
    "Nhiệm vụ: phân tích vấn đề sau một cách rõ ràng, có logic, đi thẳng vào bản chất. Trình bày theo cấu trúc: kết luận/nhận định chính trước, sau đó là các luận điểm hỗ trợ (gạch đầu dòng). " +
    "Xen chút dí dỏm để dễ đọc nhưng không làm loãng nội dung chính. Vấn đề cần phân tích: ",
  TEXT: "Trả lời câu hỏi/tin nhắn sau, đi thẳng vào ý chính: ",
};

const getPrompt = (messageType, message) => PROMPTS[messageType] + message;

const buildMessageContent = (prompt, imageParts = []) => {
  if (imageParts.length === 0) return prompt;
  return [{ type: "text", text: prompt }, ...imageParts];
};

const callOpenRouter = async (messageType, content, history = []) => {
  const modelConfig = MODELS[messageType];
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: modelConfig.name,
      messages: [
        { role: "system", content: PERSONA },
        ...history,
        { role: "user", content },
      ],
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

const generateReply = async (messageType, message, imageParts = [], history = []) => {
  const prompt = getPrompt(messageType, message);
  const content = buildMessageContent(prompt, imageParts);
  return callOpenRouter(messageType, content, history);
};

module.exports = {
  MODELS,
  getPrompt,
  buildMessageContent,
  callOpenRouter,
  generateReply,
};
