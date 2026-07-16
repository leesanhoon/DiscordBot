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
