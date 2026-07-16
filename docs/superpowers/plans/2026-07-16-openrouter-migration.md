# Chuyển flow AI từ Gemini sang OpenRouter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay thế hoàn toàn Gemini bằng OpenRouter (model free) trong flow AI của Discord bot, giữ nguyên 4 mode TEXT/VISION/CREATIVE/ANALYSIS nhưng bỏ tính năng tạo ảnh.

**Architecture:** Tách các phần logic có thể unit test được (chunk tin nhắn, dựng nội dung ảnh cho vision, gọi OpenRouter) ra thành các module nhỏ trong `src/ai/`, dùng `axios` (dependency sẵn có) để gọi OpenRouter Chat Completions API. `src/index.js` giữ nguyên cấu trúc `detectMessageType`/`handleMessage`/`startBot`, chỉ thay phần thân `generateContent` để dùng các module mới thay vì `@google/generative-ai`.

**Tech Stack:** Node.js 22 (dùng `node:test` + `node:assert/strict` built-in, không thêm dependency test mới), `axios`, `discord.js`.

## Global Constraints

- Chỉ dùng model **free** trên OpenRouter: TEXT=`meta-llama/llama-3.3-70b-instruct:free`, VISION=`google/gemma-4-31b-it:free`, CREATIVE=`nousresearch/hermes-3-llama-3.1-405b:free`, ANALYSIS=`qwen/qwen3-next-80b-a3b-instruct:free`.
- Không thêm SDK/dependency mới cho việc gọi API — dùng `axios` đã có sẵn.
- Env var mới: `OPENROUTER_API_KEY`. Xoá `GEMINI_API_KEY`, `GEMINI_API_ENDPOINT` khỏi `src/config/env.js`.
- Bỏ hoàn toàn tính năng tạo ảnh (image generation). Chỉ giữ đọc ảnh (vision) đính kèm.
- Không đổi logic/cấu trúc của `detectMessageType`, `handleMessage`, phần khởi tạo Discord client trong `src/index.js`.
- Gỡ dependency `@google/generative-ai` khỏi `package.json`.

---

### Task 1: Module `chunkMessage` (tách logic chia nhỏ tin nhắn cho giới hạn Discord)

**Files:**
- Create: `src/ai/chunkMessage.js`
- Test: `src/ai/chunkMessage.test.js`
- Modify: `package.json` (thêm script `test`)

**Interfaces:**
- Produces: `chunkMessage(text: string, maxLength?: number = 2000): string[]` — dùng bởi Task 5 (`src/index.js`).

- [ ] **Step 1: Thêm test script vào `package.json`**

Trong `package.json`, thêm vào `scripts`:

```json
"scripts": {
  "start": "node src/index.js",
  "test": "node --test"
}
```

- [ ] **Step 2: Viết test cho `chunkMessage`**

Tạo `src/ai/chunkMessage.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chunkMessage } = require("./chunkMessage");

test("returns a single chunk when text fits within maxLength", () => {
  const result = chunkMessage("Xin chao ban.", 2000);
  assert.deepEqual(result, ["Xin chao ban."]);
});

test("splits text into multiple chunks by sentence when exceeding maxLength", () => {
  const sentence1 = "A".repeat(10) + ".";
  const sentence2 = "B".repeat(10) + ".";
  const sentence3 = "C".repeat(10) + ".";
  const text = sentence1 + sentence2 + sentence3;

  const result = chunkMessage(text, 15);

  assert.deepEqual(result, [sentence1, sentence2, sentence3]);
});

test("falls back to a single chunk when text has no sentence-ending punctuation", () => {
  const result = chunkMessage("Hello world", 2000);
  assert.deepEqual(result, ["Hello world"]);
});
```

- [ ] **Step 3: Chạy test để xác nhận fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './chunkMessage'`

- [ ] **Step 4: Implement `chunkMessage`**

Tạo `src/ai/chunkMessage.js`:

```js
const chunkMessage = (text, maxLength = 2000) => {
  const chunks = [];
  let currentChunk = "";

  const sentences = text.match(/[^.!?]+[.!?]/g) || [text];

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

  return chunks;
};

module.exports = { chunkMessage };
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npm test`
Expected: PASS — 3 tests passing (`chunkMessage.test.js`)

- [ ] **Step 6: Commit**

```bash
git add package.json src/ai/chunkMessage.js src/ai/chunkMessage.test.js
git commit -m "feat: add chunkMessage module for splitting long Discord replies"
```

---

### Task 2: Module `buildVisionContent` (dựng content ảnh cho vision request)

**Files:**
- Create: `src/ai/buildVisionContent.js`
- Test: `src/ai/buildVisionContent.test.js`

**Interfaces:**
- Consumes: none (nhận `attachments: Array<{url: string, contentType: string}>` và optional `fetchImpl` — dùng để test không cần network thật).
- Produces: `buildVisionContent(attachments, fetchImpl?): Promise<Array<{type: "image_url", image_url: {url: string}}>>`, `VALID_IMAGE_TYPES: string[]` — dùng bởi Task 5 (`src/index.js`).

- [ ] **Step 1: Viết test cho `buildVisionContent`**

Tạo `src/ai/buildVisionContent.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildVisionContent } = require("./buildVisionContent");

test("filters out attachments with unsupported content types", async () => {
  const attachments = [
    { url: "http://example.com/a.pdf", contentType: "application/pdf" },
  ];
  const fakeFetch = async () => {
    throw new Error("should not be called for invalid types");
  };

  const result = await buildVisionContent(attachments, fakeFetch);

  assert.deepEqual(result, []);
});

test("builds a base64 data URL content part for a valid image attachment", async () => {
  const attachments = [
    { url: "http://example.com/a.png", contentType: "image/png" },
  ];
  const fakeFetch = async () => ({
    ok: true,
    arrayBuffer: async () => Buffer.from("fake-image-bytes"),
  });

  const result = await buildVisionContent(attachments, fakeFetch);

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "image_url");
  assert.equal(
    result[0].image_url.url,
    `data:image/png;base64,${Buffer.from("fake-image-bytes").toString("base64")}`
  );
});

test("throws when the image fetch response is not ok", async () => {
  const attachments = [
    { url: "http://example.com/a.gif", contentType: "image/gif" },
  ];
  const fakeFetch = async () => ({ ok: false, statusText: "Not Found" });

  await assert.rejects(
    () => buildVisionContent(attachments, fakeFetch),
    /Không thể tải hình ảnh: Not Found/
  );
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './buildVisionContent'`

- [ ] **Step 3: Implement `buildVisionContent`**

Tạo `src/ai/buildVisionContent.js`:

```js
const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"];

const buildVisionContent = async (attachments, fetchImpl = fetch) => {
  const imageAttachments = attachments.filter((att) =>
    VALID_IMAGE_TYPES.includes(att.contentType)
  );

  return Promise.all(
    imageAttachments.map(async (attachment) => {
      const imageResponse = await fetchImpl(attachment.url);
      if (!imageResponse.ok) {
        throw new Error(
          `Không thể tải hình ảnh: ${imageResponse.statusText}`
        );
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return {
        type: "image_url",
        image_url: {
          url: `data:${attachment.contentType};base64,${base64}`,
        },
      };
    })
  );
};

module.exports = { buildVisionContent, VALID_IMAGE_TYPES };
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test`
Expected: PASS — tổng 6 tests passing (3 từ Task 1 + 3 từ Task 2)

- [ ] **Step 5: Commit**

```bash
git add src/ai/buildVisionContent.js src/ai/buildVisionContent.test.js
git commit -m "feat: add buildVisionContent module for converting image attachments to vision content parts"
```

---

### Task 3: Env config — chuyển từ Gemini sang OpenRouter

**Files:**
- Modify: `src/config/env.js`
- Modify: `.env.example`

**Interfaces:**
- Produces: `OPENROUTER_API_KEY` export từ `src/config/env.js` — dùng bởi Task 4 (`src/ai/openrouter.js`).

- [ ] **Step 1: Cập nhật `src/config/env.js`**

Thay toàn bộ nội dung `src/config/env.js` thành:

```js
require("dotenv").config();

module.exports = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    PORT: process.env.PORT || 3000,
};
```

- [ ] **Step 2: Cập nhật `.env.example`**

Thay nội dung `.env.example` thành:

```
DISCORD_TOKEN=""
OPENROUTER_API_KEY=""
BOT_API_KEY=""
BOT_API_ENDPOINT=""
```

- [ ] **Step 3: Xác nhận không còn tham chiếu tới biến Gemini trong config**

Run: `grep -rn "GEMINI" src/config/env.js .env.example`
Expected: không có kết quả nào (empty output)

- [ ] **Step 4: Commit**

```bash
git add src/config/env.js .env.example
git commit -m "chore: replace Gemini env vars with OPENROUTER_API_KEY"
```

---

### Task 4: Module `openrouter` (MODELS, prompt, gọi OpenRouter API)

**Files:**
- Create: `src/ai/openrouter.js`
- Test: `src/ai/openrouter.test.js`

**Interfaces:**
- Consumes: `OPENROUTER_API_KEY` từ `src/config/env.js` (Task 3).
- Produces: `MODELS` object, `getPrompt(messageType, message): string`, `buildMessageContent(prompt, imageParts?): string | Array`, `callOpenRouter(messageType, content): Promise<string>`, `generateReply(messageType, message, imageParts?): Promise<string>` — dùng bởi Task 5 (`src/index.js`).

- [ ] **Step 1: Viết test cho `openrouter`**

Tạo `src/ai/openrouter.test.js`:

```js
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
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './openrouter'`

- [ ] **Step 3: Implement `openrouter`**

Tạo `src/ai/openrouter.js`:

```js
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
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test`
Expected: PASS — tổng 11 tests passing (6 từ Task 1-2 + 5 từ Task 4)

- [ ] **Step 5: Commit**

```bash
git add src/ai/openrouter.js src/ai/openrouter.test.js
git commit -m "feat: add openrouter module for calling OpenRouter chat completions API"
```

---

### Task 5: Wire vào `src/index.js`, gỡ Gemini khỏi `package.json`

**Files:**
- Modify: `src/index.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `chunkMessage` (Task 1), `buildVisionContent`, `VALID_IMAGE_TYPES` (Task 2), `generateReply` (Task 4).

- [ ] **Step 1: Thay nội dung `src/index.js`**

Thay toàn bộ nội dung `src/index.js` thành:

```js
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
```

- [ ] **Step 2: Gỡ `@google/generative-ai` khỏi `package.json`**

Trong `package.json`, xoá dòng `"@google/generative-ai": "^0.24.0",` khỏi `dependencies`.

- [ ] **Step 3: Cài lại dependencies và kiểm tra không còn package Gemini**

Run: `npm install`
Run: `grep -n "@google/generative-ai" package.json package-lock.json`
Expected: không có kết quả nào trong `package.json`; `package-lock.json` được cập nhật lại (không còn resolve gói này).

- [ ] **Step 4: Chạy toàn bộ test suite**

Run: `npm test`
Expected: PASS — tất cả 11 tests từ Task 1, 2, 4 vẫn pass (index.js không có test riêng vì phụ thuộc Discord client thật).

- [ ] **Step 5: Xác nhận không còn tham chiếu Gemini trong `src/`**

Run: `grep -rn "Gemini\|GEMINI\|generative-ai" src/`
Expected: không có kết quả nào (empty output)

- [ ] **Step 6: Commit**

```bash
git add src/index.js package.json package-lock.json
git commit -m "refactor: switch AI flow from Gemini to OpenRouter, drop image generation"
```

---

### Task 6: Xác minh thủ công với bot thật

**Files:** không có file mới — bước xác minh chạy tay.

- [ ] **Step 1: Thiết lập `.env` cục bộ**

Copy `.env.example` thành `.env`, điền `DISCORD_TOKEN` (token bot Discord thật) và `OPENROUTER_API_KEY` (API key từ https://openrouter.ai/keys).

- [ ] **Step 2: Chạy bot**

Run: `npm start`
Expected log: `Bot đã sẵn sàng với tên <bot-tag>`

- [ ] **Step 3: Test mode TEXT**

Trong Discord, gửi: `@BotName xin chào bạn khỏe không`
Expected: bot trả lời bằng văn bản, giọng điệu vui vẻ, không lỗi trong console.

- [ ] **Step 4: Test mode VISION — thiếu ảnh**

Gửi: `@BotName xem cái ảnh này giúp tôi` (không đính kèm file)
Expected: bot trả lời "Vui lòng đính kèm hình ảnh để tôi có thể phân tích."

- [ ] **Step 5: Test mode VISION — có ảnh hợp lệ**

Gửi: `@BotName xem hình này` kèm 1 file `.png` hoặc `.jpg`
Expected: bot trả lời mô tả/phân tích nội dung ảnh, không lỗi trong console.

- [ ] **Step 6: Test mode CREATIVE và ANALYSIS**

Gửi: `@BotName viết một đoạn content ngắn về cà phê`
Gửi: `@BotName phân tích ưu nhược điểm của làm việc từ xa`
Expected: cả hai đều nhận được phản hồi văn bản phù hợp với mode tương ứng.

- [ ] **Step 7: Test lỗi rate-limit/model free (nếu xảy ra)**

Nếu console log lỗi `429` khi test nhiều lần liên tiếp: xác nhận đây là do giới hạn request của model free trên OpenRouter (không phải bug), bot vẫn trả lời người dùng bằng thông báo lỗi tiếng Việt thay vì crash.

- [ ] **Step 8: Dừng bot**

Ctrl+C trong terminal đang chạy `npm start`.
