# Reply Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Discord bot read the content of a replied-to message and continue a conversation when a user replies directly to one of the bot's own messages, without requiring `@mention`.

**Architecture:** `src/index.js` gains a `getReplyContext` helper that walks up the Discord reply chain (max 3 messages) via `channel.messages.fetch`, producing a chat-style history array and a flag telling whether the immediate parent message was authored by the bot. `handleMessage` uses that flag as a second trigger condition alongside the existing `@mention` check, and passes the history down through `generateContent` into `src/ai/openrouter.js`, where `callOpenRouter`/`generateReply` insert it between the system prompt and the current user message.

**Tech Stack:** Node.js, `node:test` + `node:assert/strict` for tests, discord.js v14, axios (OpenRouter HTTP calls).

## Global Constraints

- Max reply chain depth to fetch: **3 messages** (spec: "Reply Chain Context").
- History message order sent to the AI: oldest → newest (spec: "Reply Chain Context").
- Fetch errors anywhere in the chain must be swallowed, not thrown — stop collecting context at that point (spec: "Reply Chain Context").
- Empty-content historical messages: use `"[hình ảnh]"` if attachments present, else `"[tin nhắn trống]"` (spec: "Reply Chain Context").
- Do not re-run vision analysis on attachments belonging to historical context messages (spec: "AI Integration" / "Out of Scope").
- `detectMessageType` keeps looking only at the current message's text, never at `history` (spec: "AI Integration").

---

### Task 1: `history` support in OpenRouter integration

**Files:**
- Modify: `src/ai/openrouter.js`
- Test: `src/ai/openrouter.test.js`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `callOpenRouter(messageType, content, history = [])` and `generateReply(messageType, message, imageParts = [], history = [])`, both accepting an array of `{ role: "user" | "assistant", content: string }` entries that Task 3 will build and pass through.

- [ ] **Step 1: Write the failing tests for `callOpenRouter` history handling**

Add to `src/ai/openrouter.test.js` (after the existing `callOpenRouter` test):

```js
test("callOpenRouter inserts history entries between the system and user messages", async (t) => {
  const capturedCalls = [];
  t.mock.method(axios, "post", async (url, body, options) => {
    capturedCalls.push({ url, body, options });
    return { data: { choices: [{ message: { content: "phan hoi" } }] } };
  });

  const history = [
    { role: "user", content: "tin nhan cu" },
    { role: "assistant", content: "phan hoi cu" },
  ];

  await callOpenRouter("TEXT", "xin chao", history);

  const { messages } = capturedCalls[0].body;
  assert.equal(messages.length, 4);
  assert.equal(messages[0].role, "system");
  assert.deepEqual(messages[1], { role: "user", content: "tin nhan cu" });
  assert.deepEqual(messages[2], { role: "assistant", content: "phan hoi cu" });
  assert.deepEqual(messages[3], { role: "user", content: "xin chao" });
});

test("callOpenRouter with no history behaves like before (system + user only)", async (t) => {
  const capturedCalls = [];
  t.mock.method(axios, "post", async (url, body, options) => {
    capturedCalls.push({ url, body, options });
    return { data: { choices: [{ message: { content: "phan hoi" } }] } };
  });

  await callOpenRouter("TEXT", "xin chao");

  assert.equal(capturedCalls[0].body.messages.length, 2);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test src/ai/openrouter.test.js`
Expected: FAIL — `messages.length` is `2` instead of `4` for the first new test (the second new test passes already since it matches current behavior).

- [ ] **Step 3: Implement `history` plumbing**

In `src/ai/openrouter.js`, replace `callOpenRouter` and `generateReply`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/ai/openrouter.test.js`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/ai/openrouter.js src/ai/openrouter.test.js
git commit -m "feat: thread reply-chain history through OpenRouter calls"
```

---

### Task 2: `getReplyContext` reply-chain walker in `index.js`

**Files:**
- Modify: `src/index.js`
- Create: `src/index.test.js`

**Interfaces:**
- Consumes: nothing new (pure Discord.js message/client shape, mocked in tests).
- Produces: `getReplyContext(msg, client)` → `Promise<{ isReplyToBot: boolean, history: Array<{ role: "user" | "assistant", content: string }> }>`, consumed by Task 3's `handleMessage`.

`index.js` currently calls `startBot()` unconditionally at module load, which would try to log into Discord as soon as the test file `require`s it. Guard that call so the module is safely requirable from tests.

- [ ] **Step 1: Write the failing tests**

Create `src/index.test.js`:

```js
process.env.DISCORD_TOKEN = "test-token";
process.env.OPENROUTER_API_KEY = "test-key";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getReplyContext } = require("./index");

const BOT_ID = "bot-1";
const client = { user: { id: BOT_ID } };

const makeMessage = ({ id, authorId, content, reference, hasAttachment = false }) => {
  const message = {
    id,
    content,
    author: { id: authorId, bot: authorId === BOT_ID },
    attachments: { size: hasAttachment ? 1 : 0 },
    reference: reference ? { messageId: reference } : null,
  };
  return message;
};

test("getReplyContext returns no history when the message has no reference", async () => {
  const msg = makeMessage({ id: "1", authorId: "user-1", content: "hi", reference: null });
  msg.channel = { messages: { fetch: async () => { throw new Error("should not fetch"); } } };

  const result = await getReplyContext(msg, client);

  assert.deepEqual(result, { isReplyToBot: false, history: [] });
});

test("getReplyContext detects a reply directly to the bot and builds one history entry", async () => {
  const parent = makeMessage({ id: "1", authorId: BOT_ID, content: "phan hoi cu cua bot", reference: null });
  const msg = makeMessage({ id: "2", authorId: "user-1", content: "tiep tuc di", reference: "1" });
  msg.channel = {
    messages: {
      fetch: async (id) => {
        assert.equal(id, "1");
        return parent;
      },
    },
  };

  const result = await getReplyContext(msg, client);

  assert.equal(result.isReplyToBot, true);
  assert.deepEqual(result.history, [
    { role: "assistant", content: "phan hoi cu cua bot" },
  ]);
});

test("getReplyContext walks up to 3 messages, oldest first", async () => {
  const messagesById = {
    "1": makeMessage({ id: "1", authorId: "user-2", content: "tin thu nhat", reference: null }),
    "2": makeMessage({ id: "2", authorId: BOT_ID, content: "tin thu hai", reference: "1" }),
    "3": makeMessage({ id: "3", authorId: "user-2", content: "tin thu ba", reference: "2" }),
  };
  const msg = makeMessage({ id: "4", authorId: "user-2", content: "tin hien tai", reference: "3" });
  msg.channel = { messages: { fetch: async (id) => messagesById[id] } };

  const result = await getReplyContext(msg, client);

  assert.equal(result.isReplyToBot, false);
  assert.deepEqual(result.history, [
    { role: "user", content: "tin thu nhat" },
    { role: "assistant", content: "tin thu hai" },
    { role: "user", content: "tin thu ba" },
  ]);
});

test("getReplyContext stops early and keeps partial history when a fetch fails", async () => {
  const parent = makeMessage({ id: "1", authorId: BOT_ID, content: "tin gan nhat", reference: "0" });
  const msg = makeMessage({ id: "2", authorId: "user-1", content: "hoi tiep", reference: "1" });
  msg.channel = {
    messages: {
      fetch: async (id) => {
        if (id === "1") return parent;
        throw new Error("tin nhan da bi xoa");
      },
    },
  };

  const result = await getReplyContext(msg, client);

  assert.equal(result.isReplyToBot, true);
  assert.deepEqual(result.history, [{ role: "assistant", content: "tin gan nhat" }]);
});

test("getReplyContext uses placeholders for empty-content messages", async () => {
  const withAttachment = makeMessage({ id: "1", authorId: "user-1", content: "", reference: null, hasAttachment: true });
  const empty = makeMessage({ id: "2", authorId: BOT_ID, content: "", reference: "1" });
  const msg = makeMessage({ id: "3", authorId: "user-1", content: "gi vay", reference: "2" });
  msg.channel = {
    messages: {
      fetch: async (id) => (id === "1" ? withAttachment : empty),
    },
  };

  const result = await getReplyContext(msg, client);

  assert.deepEqual(result.history, [
    { role: "user", content: "[hình ảnh]" },
    { role: "assistant", content: "[tin nhắn trống]" },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/index.test.js`
Expected: FAIL — `getReplyContext is not a function` (and likely a startup error if `startBot()` runs; that must already be guarded before these tests can even load the module — see Step 3).

- [ ] **Step 3: Implement `getReplyContext` and guard `startBot()`**

In `src/index.js`, add near the top (after `detectMessageType`, before `generateContent`):

```js
const MAX_REPLY_HISTORY = 3;

const messageToHistoryEntry = (message, client) => ({
  role: message.author.id === client.user.id ? "assistant" : "user",
  content:
    message.content ||
    (message.attachments.size > 0 ? "[hình ảnh]" : "[tin nhắn trống]"),
});

const getReplyContext = async (msg, client) => {
  const history = [];
  let current = msg;
  let isReplyToBot = false;

  for (let i = 0; i < MAX_REPLY_HISTORY; i++) {
    if (!current.reference?.messageId) break;

    let fetched;
    try {
      fetched = await current.channel.messages.fetch(current.reference.messageId);
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
```

At the bottom of `src/index.js`, replace the unconditional `startBot();` call and add exports:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/index.test.js`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS (all files, including `src/ai/openrouter.test.js`, `src/ai/chunkMessage.test.js`, `src/ai/buildVisionContent.test.js`).

- [ ] **Step 6: Commit**

```bash
git add src/index.js src/index.test.js
git commit -m "feat: add reply-chain context walker to the bot"
```

---

### Task 3: Wire reply-to-bot trigger and history into `handleMessage`

**Files:**
- Modify: `src/index.js`
- Test: `src/index.test.js`

**Interfaces:**
- Consumes: `getReplyContext(msg, client)` from Task 2; `generateReply(messageType, message, imageParts, history)` from Task 1.
- Produces: updated `handleMessage(client, msg)` and `generateContent(message, msg, history)` behavior, final deliverable of this feature.

- [ ] **Step 1: Write the failing tests**

Add to `src/index.test.js`:

```js
const { generateContent, handleMessage } = require("./index");

test("handleMessage ignores a message with no mention and no reply-to-bot", async () => {
  let replied = false;
  const msg = makeMessage({ id: "1", authorId: "user-1", content: "chao nha", reference: null });
  msg.reply = async () => { replied = true; };
  msg.channel = { messages: { fetch: async () => { throw new Error("should not fetch"); } } };

  await handleMessage(client, msg);

  assert.equal(replied, false);
});

test("handleMessage responds when the message replies directly to the bot, without a mention", async () => {
  const parent = makeMessage({ id: "1", authorId: BOT_ID, content: "cau hoi truoc", reference: null });
  const replies = [];
  const msg = makeMessage({ id: "2", authorId: "user-1", content: "vay con cai nay thi sao", reference: "1" });
  msg.reply = async (text) => { replies.push(text); };
  msg.channel = { messages: { fetch: async () => parent } };

  await handleMessage(client, msg);

  assert.equal(replies.length > 0, true);
});
```

Also add a focused test for the history plumbing through `generateContent` using dependency-light assertions (mock `axios.post` since `generateContent` ultimately calls into `openrouter.js`):

```js
const axios = require("axios");

test("generateContent forwards reply history down to the OpenRouter call", async (t) => {
  const capturedCalls = [];
  t.mock.method(axios, "post", async (url, body) => {
    capturedCalls.push(body);
    return { data: { choices: [{ message: { content: "ok" } }] } };
  });

  const msg = makeMessage({ id: "2", authorId: "user-1", content: "tiep tuc", reference: "1" });
  msg.reply = async () => {};

  const history = [{ role: "assistant", content: "tin nhan cu" }];

  await generateContent("tiep tuc", msg, history);

  assert.equal(capturedCalls[0].messages.length, 3);
  assert.deepEqual(capturedCalls[0].messages[1], { role: "assistant", content: "tin nhan cu" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/index.test.js`
Expected: FAIL — the reply-to-bot test sees `replies.length === 0` (message currently ignored because it has no mention), and the `generateContent` test sees `messages.length === 2` (history not forwarded yet).

- [ ] **Step 3: Implement the wiring**

In `src/index.js`, replace `generateContent` and `handleMessage`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/index.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (every `*.test.js` file in the project).

- [ ] **Step 6: Commit**

```bash
git add src/index.js src/index.test.js
git commit -m "feat: respond to replies aimed at the bot and forward reply context to the AI"
```

---

## Manual Verification (post-implementation)

Since this touches live Discord behavior that automated tests mock out, after all tasks are done and before opening the PR:

1. Run the bot locally (`npm start`) against a test Discord server/token.
2. Send a message mentioning the bot; confirm it still replies normally (regression check).
3. Send a message mentioning the bot, as a reply to some other user's earlier message; confirm the bot's answer reflects awareness of that earlier message's content.
4. Reply directly to one of the bot's own previous messages *without* any `@mention`; confirm the bot responds and stays on-topic with the prior exchange.
5. Reply to a message that has since been deleted (or simulate by replying to something outside history range); confirm the bot doesn't crash and still responds using whatever context it could gather.
