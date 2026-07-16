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
