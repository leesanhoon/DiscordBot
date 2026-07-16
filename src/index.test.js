process.env.DISCORD_TOKEN = "test-token";
process.env.OPENROUTER_API_KEY = "test-key";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getReplyContext, generateContent, handleMessage } = require("./index");
const axios = require("axios");

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

test("handleMessage ignores a message with no mention and no reply-to-bot", async () => {
  let replied = false;
  const msg = makeMessage({ id: "1", authorId: "user-1", content: "chao nha", reference: null });
  msg.reply = async () => { replied = true; };
  msg.channel = { messages: { fetch: async () => { throw new Error("should not fetch"); } } };

  await handleMessage(client, msg);

  assert.equal(replied, false);
});

test("handleMessage does a single cheap fetch (not a full walk) when replying to a non-bot message without a mention", async () => {
  let fetchCount = 0;
  const parent = makeMessage({ id: "1", authorId: "user-2", content: "khong phai bot", reference: null });
  const msg = makeMessage({ id: "2", authorId: "user-1", content: "vay con cai nay thi sao", reference: "1" });
  let replied = false;
  msg.reply = async () => { replied = true; };
  msg.channel = {
    messages: {
      fetch: async (id) => {
        fetchCount += 1;
        return parent;
      },
    },
  };

  await handleMessage(client, msg);

  assert.equal(fetchCount, 1);
  assert.equal(replied, false);
});

test("handleMessage responds when the message replies directly to the bot, without a mention", async (t) => {
  const capturedCalls = [];
  t.mock.method(axios, "post", async (url, body) => {
    capturedCalls.push(body);
    return { data: { choices: [{ message: { content: "day la cau tra loi" } }] } };
  });

  const parent = makeMessage({ id: "1", authorId: BOT_ID, content: "cau hoi truoc", reference: null });
  const replies = [];
  const msg = makeMessage({ id: "2", authorId: "user-1", content: "vay con cai nay thi sao", reference: "1" });
  msg.reply = async (text) => { replies.push(text); };
  msg.channel = { messages: { fetch: async () => parent } };

  await handleMessage(client, msg);

  assert.deepEqual(replies, ["day la cau tra loi"]);
  assert.equal(capturedCalls.length, 1);
  assert.deepEqual(capturedCalls[0].messages[capturedCalls[0].messages.length - 2], {
    role: "assistant",
    content: "cau hoi truoc",
  });
});

test("handleMessage responds when the message both mentions the bot and replies to the bot", async (t) => {
  const capturedCalls = [];
  t.mock.method(axios, "post", async (url, body) => {
    capturedCalls.push(body);
    return { data: { choices: [{ message: { content: "phan hoi ca hai dieu kien" } }] } };
  });

  const parent = makeMessage({ id: "1", authorId: BOT_ID, content: "cau hoi truoc do", reference: null });
  const replies = [];
  const msg = makeMessage({
    id: "2",
    authorId: "user-1",
    content: `<@${BOT_ID}> vay con cai nay thi sao`,
    reference: "1",
  });
  msg.reply = async (text) => { replies.push(text); };
  msg.channel = { messages: { fetch: async () => parent } };

  await handleMessage(client, msg);

  assert.deepEqual(replies, ["phan hoi ca hai dieu kien"]);
  assert.equal(capturedCalls.length, 1);
});

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
