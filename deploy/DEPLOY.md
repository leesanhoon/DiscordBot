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

Repo đã có sẵn workflow `.github/workflows/deploy-minipc.yml` gọi `C:\project\DiscordBot\deploy\update.ps1`, chạy trên runner có nhãn (label) `self-hosted, Windows, x64, discordbot`.

### Cài runner trên mini PC

**Quan trọng: không cài runner bên trong thư mục user profile** (ví dụ `C:\Users\Administrator\actions-runner`). Windows Service mặc định chạy dưới tài khoản hệ thống ít quyền (`NT AUTHORITY\NETWORK SERVICE`), tài khoản này **không có quyền đọc `C:\Users\<tên-user>`** do giới hạn NTFS của Windows, service sẽ crash ngay khi khởi động với lỗi `UnauthorizedAccessException`. Luôn cài ở gốc ổ đĩa, ví dụ **`C:\actions-runner`**.

1. Tạo thư mục và vào đó:
   ```powershell
   New-Item -ItemType Directory -Force -Path C:\actions-runner
   cd C:\actions-runner
   ```
2. Vào repo trên GitHub → **Settings → Actions → Runners → New self-hosted runner** → chọn **Windows**, **x64**.
3. Trang đó hiện sẵn 2 nhóm lệnh theo thứ tự — copy và chạy **lần lượt, đúng như hiển thị**, trong PowerShell quyền Administrator trên mini PC:
   - **Download**: tải file zip runner và giải nén bằng `Expand-Archive`
   - **Configure**: chạy `.\config.cmd` kèm token đăng ký riêng cho lần này (token chỉ có hiệu lực vài phút, phải lấy trực tiếp từ trang lúc đó, không dùng lại token cũ)
4. Khi `config.cmd` hỏi, trả lời:
   - **"Enter the name of the runner"** → Enter để dùng tên mặc định (tên máy)
   - **"Enter any additional labels"** → gõ `discordbot`
   - **"Enter name of work folder"** → Enter để dùng mặc định
   - **"Would you like to run the runner as service?"** → gõ `Y`
   - **"User account to use for the service"** → gõ `.\Administrator` (không dùng mặc định `NT AUTHORITY\NETWORK SERVICE` — tài khoản đó không có quyền chạy `npm install`/`git pull` mà `update.ps1` cần)
   - Nhập **mật khẩu** của tài khoản Administrator khi được hỏi

   Không có script `svc.cmd` riêng để cài service sau như tài liệu cũ của GitHub — phiên bản runner hiện tại (2.335.x) tích hợp thẳng bước cài service vào trong `config.cmd`, chỉ hỏi 1 lần lúc cấu hình.

5. Service thường tự khởi động ngay sau khi cấu hình xong. Kiểm tra:
   ```powershell
   Get-Service actions.runner.*
   ```
   Nếu vẫn `Stopped`, khởi động tay và đặt tự chạy cùng máy:
   ```powershell
   Start-Service actions.runner.<tên-service-vừa-thấy>
   Set-Service actions.runner.<tên-service-vừa-thấy> -StartupType Automatic
   ```
6. Xác nhận runner online: **Settings → Actions → Runners** sẽ thấy trạng thái **Idle** (màu xanh), với label `self-hosted`, `Windows`, `X64`, `discordbot`.

Từ giờ có thể đóng terminal thoải mái — runner chạy nền dưới dạng Windows Service, tự bật lại khi mini PC khởi động lại.

### Kiểm tra hoạt động

Push 1 commit bất kỳ lên `main`, vào tab **Actions** của repo trên GitHub xem workflow **Deploy to Mini PC** chạy — nếu thành công, `C:\project\DiscordBot` trên mini PC đã được cập nhật và service `DiscordBot` đã restart tự động.

### Quản lý runner service

```powershell
cd C:\actions-runner

# Xem trạng thái
Get-Service actions.runner.*

# Dừng / khởi động lại
Stop-Service actions.runner.<ten-service>
Start-Service actions.runner.<ten-service>

# Chạy tay (không qua service) để debug — Ctrl+C để dừng
.\run.cmd

# Gỡ đăng ký hoàn toàn (lấy token remove mới từ Settings → Actions → Runners → bấm vào runner → Remove)
.\config.cmd remove --token <token_remove_moi>
```

### Xử lý lỗi thường gặp khi cài runner

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `UnauthorizedAccessException: Access to the path 'C:\Users\...' is denied` trong `_diag\Runner_*.log`, service tự Stop ngay sau khi Start | Runner cài bên trong thư mục user profile (`C:\Users\<user>\...`), service account mặc định không đọc được | Gỡ đăng ký (`config.cmd remove`), chuyển thư mục ra `C:\actions-runner`, cấu hình lại từ đó |
| Job trên GitHub Actions treo mãi ở "Waiting for a runner to pick up this job..." | Không có runner nào online khớp đủ label trong `runs-on` của workflow | Kiểm tra **Settings → Actions → Runners** — runner phải **Idle**; nếu **Offline**, service runner chưa chạy. Kiểm tra label đăng ký lúc `config.cmd` khớp đúng với `runs-on` trong `deploy-minipc.yml` |
| `update.ps1` báo lỗi "Script nay can chay voi quyen Administrator" khi chạy qua job của GitHub Actions | Windows Service của runner đang chạy dưới tài khoản ít quyền (`NT AUTHORITY\NETWORK SERVICE`), không phải Administrator | Đổi tài khoản Log On của service sang Administrator: `services.msc` → tìm service runner → Properties → tab **Log On** → **This account** → `.\Administrator` + mật khẩu → Restart service. Hoặc gỡ và cấu hình lại, chọn `.\Administrator` ngay từ bước hỏi service account |
| `./config.sh` hoặc `.\svc.cmd` báo "not recognized" | Nhầm lệnh — đó là script cho Linux/macOS hoặc phiên bản runner cũ | Trên Windows dùng `.\config.cmd`; phiên bản runner hiện tại không có `svc.cmd` riêng, cài service tích hợp sẵn trong `config.cmd` |

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
