# DiscordBot

Bot Discord dùng Node.js + discord.js, gọi model AI qua OpenRouter (free models) cho 4 chế độ: TEXT, VISION, CREATIVE, ANALYSIS.

## Chạy local

Yêu cầu: Node.js 22, npm.

```bash
npm install
cp .env.example .env
# điền DISCORD_TOKEN và OPENROUTER_API_KEY vào .env
npm start
```

Chạy test:

```bash
npm test
```

## Kiến trúc

- `src/index.js` — khởi tạo Discord client, phát hiện loại tin nhắn (`detectMessageType`), điều phối xử lý (`handleMessage`).
- `src/ai/openrouter.js` — cấu hình model, dựng prompt, gọi OpenRouter Chat Completions API.
- `src/ai/buildVisionContent.js` — chuyển ảnh đính kèm Discord thành content phần vision cho model.
- `src/ai/chunkMessage.js` — chia nhỏ phản hồi dài vượt giới hạn tin nhắn Discord.
- `src/config/env.js` — đọc biến môi trường từ `.env`.

## Deploy lên Windows Server (mini PC)

Xem hướng dẫn đầy đủ tại [`deploy/DEPLOY.md`](deploy/DEPLOY.md) — cài bot như Windows Service (dùng NSSM), và tùy chọn tự động cập nhật khi push code qua GitHub self-hosted runner (`.github/workflows/deploy-minipc.yml`).
