# Chuyển flow AI từ Gemini sang OpenRouter

## Bối cảnh

`src/index.js` hiện gọi Google Gemini trực tiếp qua `@google/generative-ai`. Bot phát hiện 4 loại tin nhắn (TEXT/VISION/CREATIVE/ANALYSIS) bằng regex trong `detectMessageType`, mỗi loại dùng một model Gemini + `generationConfig` riêng. Mode VISION vừa đọc ảnh đính kèm vừa hỗ trợ tạo ảnh (`responseModalities: ["Text", "Image"]`, xử lý `part.inlineData`).

Mục tiêu: thay thế hoàn toàn Gemini bằng OpenRouter.

## Ràng buộc đã xác nhận

- Dùng **model free** trên OpenRouter cho tất cả các mode.
- Đã kiểm tra trực tiếp OpenRouter API (`GET /api/v1/models`, lọc id kết thúc bằng `:free`): **không có model free nào hỗ trợ image output (image generation)**. Một số model free có hỗ trợ image input (vision).
- Vì vậy: **bỏ tính năng tạo ảnh**, chỉ giữ tính năng đọc ảnh (vision) đính kèm.
- Giữ nguyên cấu trúc 4 mode (TEXT/VISION/CREATIVE/ANALYSIS) và logic `detectMessageType` hiện có.

## Model được chọn cho từng mode

| Mode | Model ID (OpenRouter, free) | Vai trò |
|---|---|---|
| TEXT | `meta-llama/llama-3.3-70b-instruct:free` | Trả lời chung |
| VISION | `google/gemma-4-31b-it:free` | Đọc/phân tích ảnh đính kèm |
| CREATIVE | `nousresearch/hermes-3-llama-3.1-405b:free` | Sáng tác nội dung |
| ANALYSIS | `qwen/qwen3-next-80b-a3b-instruct:free` | Phân tích/so sánh/tổng hợp |

Nguồn xác nhận: gọi trực tiếp `https://openrouter.ai/api/v1/models`, kiểm tra `architecture.input_modalities` / `architecture.output_modalities` của từng model `:free`.

## Kiến trúc

- **Gọi API**: dùng `axios` (đã là dependency sẵn có trong `package.json`) để `POST https://openrouter.ai/api/v1/chat/completions`. Không thêm SDK mới, không cần `@google/generative-ai` nữa (gỡ khỏi `package.json`).
- **Auth**: header `Authorization: Bearer ${OPENROUTER_API_KEY}`.
- **Env vars**:
  - Thêm `OPENROUTER_API_KEY` vào `src/config/env.js` và `.env`.
  - Xoá `GEMINI_API_KEY`, `GEMINI_API_ENDPOINT` khỏi `src/config/env.js`.

## Model config (thay thế `MODELS` object hiện tại)

```js
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
```

Tham số `topK` (đặc thù Gemini) bị bỏ — chuẩn OpenAI/OpenRouter Chat Completions không hỗ trợ.

## Prompt

Giữ nguyên 4 câu prompt tiếng Việt hiện có theo mode (VISION/CREATIVE/ANALYSIS/TEXT), gắn vào `messages[0] = { role: "user", content: ... }`.

## Xử lý ảnh (vision only)

- Khi `messageType === "VISION"` và `msg.attachments.size > 0`:
  - Lọc attachment theo `validImageTypes` (JPG/PNG/GIF) như hiện tại.
  - Tải ảnh, convert sang base64, dựng thành `data:` URL (`data:${contentType};base64,${base64}`).
  - Gửi theo format OpenAI vision multi-part content:
    ```js
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUrl } },
      // ...một phần tử image_url cho mỗi ảnh đính kèm
    ]
    ```
- Khi VISION mode mà không có ảnh hợp lệ đính kèm: giữ nguyên message nhắc người dùng đính kèm ảnh (như code hiện tại).
- **Bỏ hoàn toàn**: nhánh `isImageGeneration`, xử lý `part.inlineData`, `AttachmentBuilder` cho ảnh sinh ra. Bot không còn tạo ảnh.

## Response handling

- OpenRouter trả `response.data.choices[0].message.content` (string thuần), khác cấu trúc `candidates[0].content.parts` của Gemini.
- Giữ nguyên logic chunk theo câu (`match(/[^.!?]+[.!?]/g)`) và giới hạn 2000 ký tự/message của Discord, gửi từng chunk qua `msg.reply`.

## Error handling

- Giữ try/catch bao ngoài như hiện tại, trả lời tiếng Việt khi lỗi ("Xin lỗi, tôi gặp vấn đề khi xử lý yêu cầu của bạn...").
- Log thêm `error.response?.status` và `error.response?.data` (nếu có) khi request tới OpenRouter thất bại, để phân biệt lỗi auth (401), rate-limit của model free (429), hay lỗi model không khả dụng (400/404) — các lỗi này phổ biến hơn với model free có giới hạn request.

## Ngoài phạm vi

- Không xây dựng cơ chế fallback tự động giữa Gemini và OpenRouter (đã chọn thay thế hoàn toàn).
- Không thêm tính năng tạo ảnh trả phí (đã chọn bỏ hẳn tạo ảnh).
- Không thay đổi `detectMessageType`, cấu trúc `handleMessage`, hay phần khởi tạo Discord client.
