# Deploy DiscordBot lên Windows Server (mini PC)

Hướng dẫn cài đặt và chạy bot như một Windows Service (tự khởi động cùng máy, tự restart nếu crash), dùng 2 script trong thư mục `deploy/` của chính repo này.

Toàn bộ hướng dẫn dưới đây giả định bạn tự `git clone` project vào **`C:\project\DiscordBot`**. Nếu dùng đường dẫn khác, chỉ cần truyền thêm `-InstallDir "<đường dẫn của bạn>"` khi chạy `deploy.ps1`/`update.ps1`.

## Yêu cầu

- Mini PC chạy Windows Server (hoặc Windows 10/11), có kết nối internet.
- Quyền Administrator trên máy đó.
- Đã có `DISCORD_TOKEN` (tab **Bot** trong https://discord.com/developers/applications, nút **Reset Token**) và `OPENROUTER_API_KEY` (https://openrouter.ai/keys).

Bot không mở port nào, chỉ kết nối ra ngoài tới Discord Gateway và OpenRouter API — không cần cấu hình firewall inbound hay port forwarding.

## Cài lần đầu — `deploy.ps1`

1. Cài **Node.js LTS**: https://nodejs.org (chọn bản Windows Installer, giữ mặc định "Add to PATH").
2. Cài **Git**: https://git-scm.com/download/win (giữ mặc định).
3. Clone project vào `C:\project\DiscordBot`:

   ```powershell
   git clone https://github.com/leesanhoon/DiscordBot.git C:\project\DiscordBot
   ```

4. Mở PowerShell **bằng quyền Administrator** (chuột phải → Run as Administrator), vào thư mục `deploy` bên trong repo vừa clone rồi chạy script:

   ```powershell
   cd C:\project\DiscordBot\deploy
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
   .\deploy.ps1
   ```

   Vì `C:\project\DiscordBot` đã có sẵn (bạn vừa clone), script sẽ nhận ra và chạy `git pull` thay vì clone lại — không sao, coi như bước đồng bộ code mới nhất. Sau đó script sẽ:
   - Chạy `npm install --omit=dev`
   - Tải NSSM về `C:\project\nssm` (nếu chưa có) và tạo Windows Service tên `DiscordBot`

5. **Lần chạy đầu tiên sẽ dừng lại** vì chưa có `.env` — script tự tạo file rỗng tại `C:\project\DiscordBot\.env`. Mở file này, điền:

   ```
   DISCORD_TOKEN="token_that_cua_ban"
   OPENROUTER_API_KEY="key_that_cua_ban"
   ```

6. Chạy lại (vẫn trong `C:\project\DiscordBot\deploy`):

   ```powershell
   .\deploy.ps1
   ```

   Lần này sẽ cài Service và khởi động bot.

7. Kiểm tra:

   ```powershell
   Get-Service DiscordBot
   Get-Content C:\project\DiscordBot\logs\out.log -Tail 30
   ```

   Kỳ vọng thấy dòng `Bot đã sẵn sàng với tên ...` trong `out.log`.

### Tuỳ chỉnh thư mục cài đặt / tên service

Nếu bạn clone vào đường dẫn khác `C:\project\DiscordBot`, truyền thêm tham số:

```powershell
.\deploy.ps1 -InstallDir "D:\Bots\DiscordBot" -ServiceName "MyDiscordBot"
```

Dùng đúng `-InstallDir` và `-ServiceName` này cho `update.ps1` sau này nếu bạn đổi mặc định.

## Cập nhật code sau này — `update.ps1`

Mỗi khi có code mới trên GitHub, chạy (PowerShell quyền Administrator):

```powershell
cd C:\project\DiscordBot\deploy
.\update.ps1
```

Script sẽ: dừng service → `git pull` → `npm install --omit=dev` → khởi động lại service → in 20 dòng log lỗi gần nhất để kiểm tra nhanh.

## Tự động cập nhật khi push (GitHub self-hosted runner)

Mặc định push lên GitHub **không** tự cập nhật server — phải tự chạy `update.ps1`. Để tự động hoá, cài một **GitHub Actions self-hosted runner** ngay trên mini PC: runner này tự kết nối ra ngoài tới GitHub (không cần mở port vào máy), khi có push vào `main` thì GitHub sẽ giao việc cho runner này chạy `update.ps1` giúp bạn.

Repo đã có sẵn workflow `.github/workflows/deploy-minipc.yml` gọi `C:\project\DiscordBot\deploy\update.ps1`, chạy trên runner có nhãn (label) `self-hosted, windows, minipc`.

### Cài runner trên mini PC

1. Vào repo trên GitHub → **Settings → Actions → Runners → New self-hosted runner** → chọn **Windows**.
2. GitHub sẽ hiện sẵn các lệnh tải/cấu hình kèm token đăng ký riêng cho lần này — copy và chạy đúng các lệnh đó trong PowerShell trên mini PC (token hết hạn sau ít phút nên phải lấy trực tiếp từ trang này, không dùng lại token cũ).
3. Khi `config.cmd` hỏi **"Enter any additional labels"**, nhập: `windows,minipc` (label `self-hosted` được GitHub tự thêm).
4. Sau khi cấu hình xong, cài runner chạy nền như Windows Service để không cần mở terminal — làm theo hướng dẫn cài "as a service" mà trang GitHub đó hiển thị (chạy với tài khoản có quyền `Restart-Service`/`git pull`/`npm install` trên `C:\project\DiscordBot`, tức tài khoản Administrator đã dùng ở bước `deploy.ps1`).
5. Xác nhận runner online: **Settings → Actions → Runners** sẽ thấy trạng thái **Idle** (màu xanh).

### Kiểm tra hoạt động

Push 1 commit bất kỳ lên `main`, vào tab **Actions** của repo trên GitHub xem workflow **Deploy to Mini PC** chạy — nếu thành công, `C:\project\DiscordBot` trên mini PC đã được cập nhật và service đã restart tự động.

### Lưu ý bảo mật

Self-hosted runner sẽ **thực thi bất kỳ code nào trong workflow của repo** ngay trên máy đó. Vì đây là repo riêng tư của bạn nên an toàn; nhưng nếu sau này repo public hoặc nhận PR từ người ngoài, cần bật giới hạn "Require approval for all outside collaborators" trong Settings → Actions, tránh người lạ chạy code tuỳ ý trên mini PC qua một PR độc hại.

## Các lệnh quản lý thường dùng

```powershell
# Xem trạng thái
Get-Service DiscordBot

# Dừng / khởi động / khởi động lại
Stop-Service DiscordBot
Start-Service DiscordBot
Restart-Service DiscordBot

# Xem log realtime
Get-Content C:\project\DiscordBot\logs\out.log -Tail 30 -Wait
Get-Content C:\project\DiscordBot\logs\err.log -Tail 30 -Wait

# Gỡ service hoàn toàn (nếu cần cài lại từ đầu)
Stop-Service DiscordBot
C:\project\nssm\nssm.exe remove DiscordBot confirm
```

## Xử lý lỗi thường gặp

| Log thấy | Nguyên nhân | Cách sửa |
|---|---|---|
| `Error [TokenInvalid]` | `DISCORD_TOKEN` sai/hết hạn | Vào Developer Portal → tab Bot → Reset Token → cập nhật `.env` → `Restart-Service DiscordBot` |
| `401` khi gọi OpenRouter | `OPENROUTER_API_KEY` sai | Tạo lại key ở https://openrouter.ai/keys → cập nhật `.env` → restart service |
| `429` khi gọi OpenRouter | Model free bị rate-limit | Không phải bug, chờ hoặc thử lại sau; bot vẫn trả lời người dùng bằng thông báo lỗi tiếng Việt thay vì crash |
| Service không tự chạy sau khi restart máy | `Start` chưa để `SERVICE_AUTO_START` | Chạy lại `deploy.ps1` (idempotent) hoặc `nssm set DiscordBot Start SERVICE_AUTO_START` |

## Bảo mật

- **Không commit `.env` lên git** — file này đã nằm trong `.gitignore`.
- Chỉ người có quyền Administrator trên server mới đọc được `.env` chứa token thật.
