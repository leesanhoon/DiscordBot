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
