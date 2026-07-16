# Reply Context Design

Date: 2026-07-16

## Purpose

Hiện tại bot Discord chỉ trả lời khi bị `@mention` trực tiếp trong nội dung tin
nhắn, và chỉ dùng đúng nội dung tin nhắn đó — không đọc được tin nhắn mà user
vừa "Reply" (trả lời) tới. Điều này khiến bot không giữ được ngữ cảnh hội thoại
khi user dùng tính năng reply của Discord.

Mục tiêu: cho phép bot (1) đọc nội dung tin nhắn gốc khi user reply, và (2) cho
phép tiếp tục hội thoại tự nhiên khi reply thẳng vào tin nhắn trước đó của bot,
không cần gõ lại `@mention`.

## Trigger Conditions

Bot xử lý và trả lời một tin nhắn `msg` khi một trong hai điều kiện đúng:

1. `msg.content` chứa `@mention` bot (hành vi hiện tại, giữ nguyên).
2. `msg.reference` tồn tại và tin nhắn gốc (`referencedMessage.author.bot ===
   true` và `referencedMessage.author.id === client.user.id`) là do chính bot
   gửi.

Nếu không thỏa điều kiện nào, bot bỏ qua tin nhắn như hiện tại.

Nội dung câu hỏi gửi cho AI (`query`) vẫn được lấy từ `msg.content` sau khi
loại bỏ chuỗi `@mention` (nếu có). Nếu trigger bằng điều kiện (2) và
`msg.content` không có gì sau khi trim, dùng nguyên `msg.content` (không cần
loại bỏ mention vì không có).

## Reply Chain Context

Khi `msg.reference` tồn tại (bất kể trigger bởi điều kiện nào), bot lấy thêm
ngữ cảnh từ chuỗi reply:

- Fetch tin nhắn gốc bằng `msg.channel.messages.fetch(msg.reference.messageId)`.
- Nếu tin gốc đó cũng có `reference`, tiếp tục fetch ngược lên, tối đa **3 tin
  nhắn** trong chuỗi (tính từ tin ngay trước `msg`, không tính `msg` hiện tại).
- Dừng sớm nếu: đã đủ 3 tin, hết chuỗi (tin không còn `reference`), hoặc fetch
  lỗi (tin bị xoá, không có quyền đọc, kênh khác...). Lỗi fetch không được
  throw ra ngoài — chỉ dừng thu thập context tại điểm đó và dùng những gì đã
  lấy được.
- Với mỗi tin nhắn lấy được, tạo entry:
  - `role`: `"assistant"` nếu `author.bot && author.id === client.user.id`,
    ngược lại `"user"`.
  - `content`: `message.content` nếu có text; nếu rỗng nhưng có attachments,
    dùng placeholder `"[hình ảnh]"`; nếu rỗng và không có gì, dùng `"[tin nhắn
    trống]"`.
- Thứ tự cuối cùng của mảng `history` truyền cho AI phải là **cũ → mới** (tin
  xa nhất trước, tin gần `msg` nhất sau cùng).

Không phân tích lại nội dung ảnh đính kèm của các tin nhắn context cũ — chỉ
dùng placeholder text, không gọi lại vision API cho chúng.

## AI Integration (`src/ai/openrouter.js`)

- `generateReply(messageType, message, imageParts = [], history = [])`: thêm
  tham số `history` (mảng `{ role, content }`, có thể rỗng).
- `callOpenRouter(messageType, content, history = [])`: dựng mảng `messages`
  gửi cho OpenRouter theo thứ tự:
  ```
  [
    { role: "system", content: PERSONA },
    ...history,
    { role: "user", content },
  ]
  ```
- `detectMessageType` không thay đổi — chỉ dựa trên nội dung tin nhắn hiện tại
  (`msg.content` sau khi xử lý), không xét nội dung trong `history`.

## Message Handling (`src/index.js`)

- `handleMessage` cập nhật điều kiện early-return để bao gồm cả trigger bằng
  reply-tới-bot (điều kiện 2 ở trên).
- Thêm hàm `buildReplyHistory(msg, client)` (hoặc tương đương) chịu trách
  nhiệm fetch chuỗi reply tối đa 3 tin và trả về mảng `history` theo định dạng
  ở trên. Hàm này tự bắt lỗi fetch nội bộ, không throw.
- `generateContent` truyền `history` xuống `generateReply`.

## Out of Scope

- Không giới hạn theo thời gian (chỉ giới hạn theo số lượng tin nhắn: 3).
- Không xử lý lại ảnh trong các tin nhắn context cũ.
- Không hỗ trợ reply vào tin nhắn ở kênh/thread khác kênh hiện tại (Discord
  reply luôn cùng kênh nên không phát sinh trường hợp này).

## Testing

- Unit test `buildReplyHistory`-tương-đương: chuỗi đủ 3 tin, chuỗi ngắn hơn 3,
  chuỗi bị lỗi fetch giữa chừng, tin không có `reference`.
- Unit test `callOpenRouter`/`generateReply` với `history` rỗng và không rỗng,
  kiểm tra thứ tự messages gửi đi.
- Test trigger condition trong `handleMessage`: mention only, reply-to-bot
  only, cả hai, không thỏa điều kiện nào.
