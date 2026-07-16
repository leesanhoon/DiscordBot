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
