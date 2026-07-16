process.env.OPENROUTER_API_KEY = "test-key";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const {
  MODELS,
  getPrompt,
  buildMessageContent,
  callOpenRouter,
  generateReply,
} = require("./openrouter");

test("getPrompt concatenates the TEXT prompt prefix with the message", () => {
  const result = getPrompt("TEXT", "xin chao");
  assert.equal(
    result,
    "Hãy trả lời câu hỏi với thông tin chính xác, giọng điệu vui vẻ và hài hước: xin chao"
  );
});

test("buildMessageContent returns a plain string when there are no image parts", () => {
  const result = buildMessageContent("hello", []);
  assert.equal(result, "hello");
});

test("buildMessageContent returns a content array when image parts are present", () => {
  const imagePart = {
    type: "image_url",
    image_url: { url: "data:image/png;base64,AAA" },
  };
  const result = buildMessageContent("hello", [imagePart]);
  assert.deepEqual(result, [{ type: "text", text: "hello" }, imagePart]);
});

test("callOpenRouter posts to the OpenRouter chat completions endpoint and returns the reply text", async (t) => {
  const capturedCalls = [];
  t.mock.method(axios, "post", async (url, body, options) => {
    capturedCalls.push({ url, body, options });
    return { data: { choices: [{ message: { content: "phan hoi tu model" } }] } };
  });

  const result = await callOpenRouter("TEXT", "xin chao");

  assert.equal(result, "phan hoi tu model");
  assert.equal(capturedCalls.length, 1);
  assert.equal(capturedCalls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(capturedCalls[0].body.model, MODELS.TEXT.name);
  assert.deepEqual(capturedCalls[0].body.messages, [
    { role: "user", content: "xin chao" },
  ]);
  assert.equal(capturedCalls[0].options.headers.Authorization, "Bearer test-key");
});

test("generateReply builds the prompt, calls OpenRouter and returns the content", async (t) => {
  t.mock.method(axios, "post", async () => ({
    data: { choices: [{ message: { content: "ket qua" } }] },
  }));

  const result = await generateReply("CREATIVE", "viet mot cau chuyen");

  assert.equal(result, "ket qua");
});
