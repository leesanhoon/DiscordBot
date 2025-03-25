# DiscordBot

## Requirements

1. **GitHub Repository**: Your Node.js project should be pushed to GitHub.
2. **Docker Hub**: A Docker Hub account with a created repository.
3. **VPS**: A VPS with Docker installed and an SSH key for GitHub Actions access.
4. **SSH Key**: An SSH key pair for GitHub Actions to connect to the VPS.

## Step 1: Prepare the Project

1. **Dockerfile**:

    ```dockerfile
    FROM node:18
    WORKDIR /app
    COPY package*.json ./
    RUN npm install
    COPY . .
    EXPOSE 3000
    CMD ["npm", "start"]
    ```

2. **.dockerignore**:

    ```
    node_modules
    npm-debug.log
    .git
    .gitignore
    ```

## Step 2: Create SSH Key for VPS

1. **Generate SSH Key**:

    ```bash
    ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
    ```

2. **Add Public Key to VPS**:

    ```bash
    cat ~/.ssh/id_rsa.pub
    ```

    On VPS:

    ```bash
    echo "your-public-key" >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    chmod 700 ~/.ssh
    ```

3. **Save Private Key** lưu git action:

    ```bash
    cat ~/.ssh/id_rsa
    ```

## Step 3: Configure GitHub Actions

1. **Create Workflow**:

    Create `.github/workflows/deploy.yml`:

    ```yaml
    name: CI/CD Pipeline
        on:
        push:
        branches: - main
        pull_request:
        branches: - main

        jobs:
        build:
        environment: production
        runs-on: ubuntu-latest
        steps: # Checkout code với full history nếu cần - name: Checkout code
        uses: actions/checkout@v4
        with:
        fetch-depth: 0 # Lấy full history để tạo version từ git tag nếu cần

                    # Cache Docker layers để tăng tốc build
                    - name: Cache Docker layers
                    uses: actions/cache@v3
                    with:
                        path: /tmp/.buildx-cache
                        key: ${{ runner.os }}-buildx-${{ github.sha }}
                        restore-keys: |
                            ${{ runner.os }}-buildx-

                    # Thiết lập Buildx để build nhanh hơn và hỗ trợ multi-platform
                    - name: Set up Docker Buildx
                    uses: docker/setup-buildx-action@v3

                    # Đăng nhập Docker Hub trước để tránh lỗi auth giữa chừng
                    - name: Login to Docker Hub
                    uses: docker/login-action@v3
                    with:
                        username: ${{ secrets.DOCKER_HUB_USERNAME }}
                        password: ${{ secrets.DOCKER_HUB_TOKEN }}

                    # Thiết lập Node.js với cache
                    - name: Set up Node.js
                    uses: actions/setup-node@v4
                    with:
                        node-version: 20
                        cache: "npm"
                        cache-dependency-path: package-lock.json # Đảm bảo cache chính xác

                    # Cài dependencies với kiểm tra lỗi
                    - name: Install dependencies
                    run: npm ci --prefer-offline --no-audit
                    # --prefer-offline: Dùng cache nếu có
                    # --no-audit: Bỏ qua audit để nhanh hơn

                    # Build và push Docker image với cache và tag versioning
                    - name: Build and Push Docker image
                    id: docker_build
                    run: |
                        # Lấy git tag hoặc commit sha làm version
                        VERSION=$(git describe --tags --always --dirty || echo "latest")
                        IMAGE_NAME="${{ secrets.DOCKER_HUB_USERNAME }}/discordbot"
                        docker buildx build \
                            --cache-from type=local,src=/tmp/.buildx-cache \
                            --cache-to type=local,dest=/tmp/.buildx-cache \
                            --tag "${IMAGE_NAME}:${VERSION}" \
                            --tag "${IMAGE_NAME}:latest" \
                            --output type=registry \
                            --push \
                            .
                    env:
                        DOCKER_BUILDKIT: 1 # Bật BuildKit để build nhanh hơn

                    # Kiểm tra kết quả build
                    - name: Verify build
                    run: |
                        echo "Built and pushed image: ${{ secrets.DOCKER_HUB_USERNAME }}/discordbot:${{ steps.docker_build.outputs.version }}"

            deploy:
                needs: build
                runs-on: ubuntu-latest
                environment: production
                steps:
                    - name: Deploy to VPS
                    uses: appleboy/ssh-action@master
                    with:
                        host: ${{ secrets.VPS_HOST }}
                        username: root
                        key: ${{ secrets.VPS_SSH_KEY }}
                        script: |
                            # Thiết lập biến
                            IMAGE="${{ secrets.DOCKER_HUB_USERNAME }}/discordbot:latest"
                            CONTAINER_NAME="discordbot"
                            ENV_FILE="/home/root/config/.env"
                            BACKUP_TAG=$(date +%Y%m%d_%H%M%S)
                            BACKUP_IMAGE="${{ secrets.DOCKER_HUB_USERNAME }}/discordbot-backup:${BACKUP_TAG}"

                            # Debug giá trị biến
                            echo "IMAGE: $IMAGE"
                            echo "BACKUP_IMAGE: $BACKUP_IMAGE"

                            # Kiểm tra file .env
                            echo "🔍 Checking .env file..."
                            if [ ! -f "$ENV_FILE" ]; then
                                echo "Error: .env file not found at $ENV_FILE"
                                exit 1
                            fi
                            if [ ! -r "$ENV_FILE" ]; then
                                echo "Error: .env file at $ENV_FILE is not readable"
                                exit 1
                            fi

                            # Pull image với retry
                            echo "🔄 Pulling latest Docker image..."
                            for i in {1..3}; do
                                docker pull "$IMAGE" && break
                                echo "Pull failed, retrying ($i/3)..."
                                sleep 5
                            done || {
                                echo "Error: Failed to pull $IMAGE after 3 attempts"
                                exit 1
                            }

                            # Lưu container cũ để rollback
                            echo "📦 Backing up old container ID..."
                            OLD_CONTAINER=$(docker ps -q -f name="$CONTAINER_NAME")
                            if [ -n "$OLD_CONTAINER" ]; then
                                echo "Creating backup image: $BACKUP_IMAGE"
                                docker commit "$CONTAINER_NAME" "$BACKUP_IMAGE" || {
                                echo "Warning: Failed to create backup image"
                                }
                            else
                                echo "No old container found to backup"
                            fi

                            # Dừng và xóa container cũ
                            echo "🛑 Stopping and removing old container..."
                            docker stop "$CONTAINER_NAME" 2>/dev/null || true
                            docker rm "$CONTAINER_NAME" 2>/dev/null || true

                            # Chạy container mới
                            echo "🚀 Running new container..."
                            docker run -d --name "$CONTAINER_NAME" \
                                --env-file "$ENV_FILE" \
                                -p 3000:3000 \
                                --restart unless-stopped \
                                "$IMAGE" || {
                                echo "Error: Failed to start container"
                                if [ -n "$OLD_CONTAINER" ]; then
                                echo "⏪ Rolling back to previous container..."
                                docker stop "$CONTAINER_NAME" 2>/dev/null || true
                                docker rm "$CONTAINER_NAME" 2>/dev/null || true
                                docker run -d --name "$CONTAINER_NAME" \
                                    -p 3000:3000 \
                                    "$BACKUP_IMAGE" || echo "Rollback failed"
                                fi
                                exit 1
                            }

                            # Chờ và kiểm tra health
                            echo "⏳ Waiting for container to stabilize..."
                            sleep 10
                            STATUS=$(docker inspect "$CONTAINER_NAME" --format '{{.State.Status}}' || echo "not_found")
                            if [ "$STATUS" != "running" ]; then
                                echo "Error: Container is not running (Status: $STATUS)"
                                exit 1
                            fi

                            # Kiểm tra logs
                            echo "📜 Checking Docker logs..."
                            docker logs --tail=50 "$CONTAINER_NAME" || echo "⚠️ No logs available yet"

                            # Kiểm tra container
                            echo "🔍 Checking running containers..."
                            docker ps -a

                            echo "🎯 Deployment completed successfully!"

    ```

## Step 4: Add Secrets to GitHub

1. Go to your GitHub repository:

    - Settings > Secrets and variables > Actions > New repository secret.

2. Add the following secrets:
    - `DOCKER_HUB_USERNAME`: Your Docker Hub username.
    - `DOCKER_HUB_TOKEN`: Docker Hub access token.
    - `VPS_HOST`: Your VPS IP address.
    - `VPS_USERNAME`: Your VPS username.
    - `VPS_SSH_KEY`: Content of your `id_rsa` (private key).

## Step 5: Test and Run

1. **Push Code to GitHub**:

    ```bash
    git add .
    git commit -m "Add GitHub Actions for deployment"
    git push origin main
    ```

2. **Monitor Workflow**:

    Go to the **Actions** tab on GitHub to monitor the workflow.

3. **Access Application**:

    Open your browser and go to `http://your-vps-ip:3000`.

## Step 6: Optimize and Secure

1. **Check Logs**:

    On VPS:

    ```bash
    docker logs discordbot
    ```

2. **Auto-Restart**:

    Update `deploy.yml` to add `--restart unless-stopped`:

    ```bash
    docker run -d -p 3000:3000 --restart unless-stopped --name discordbot nguyentanninh123/discordbot:latest
    ```

3. **Secure SSH**:

    Do not store SSH keys publicly. Use GitHub Secrets.

## Result

-   On each push to the `main` branch, GitHub Actions will:

    1. Build the Docker image.
    2. Push the image to Docker Hub.
    3. Pull the image on the VPS and restart the container.

-   The process is fully automated, and you only need to check logs if there are errors.

---

### **Yêu cầu**

1. **Repository GitHub**: Dự án Node.js của bạn đã được đẩy lên GitHub.
2. **Docker Hub**: Tài khoản Docker Hub với repository đã tạo.
3. **VPS**: Đã cài Docker và có SSH key để GitHub Actions truy cập.
4. **SSH Key**: Cần tạo cặp khóa SSH để GitHub Actions kết nối với VPS.

---

### **Bước 1: Chuẩn bị dự án**

1. **Cấu trúc dự án**:

    - Đảm bảo bạn đã có `Dockerfile` trong thư mục gốc (như hướng dẫn trước):
        ```dockerfile
        FROM node:18
        WORKDIR /app
        COPY package*.json ./
        RUN npm install
        COPY . .
        EXPOSE 3000
        CMD ["npm", "start"]
        ```
    - File `.dockerignore`:
        ```
        node_modules
        npm-debug.log
        .git
        .gitignore
        ```

2. **Kiểm tra cục bộ**:
    - Build và chạy thử:
        ```bash
        docker build -t my-node-app .
        docker run -p 3000:3000 my-node-app
        ```

---

### **Bước 2: Tạo SSH Key cho VPS**

1. **Tạo SSH Key trên máy cục bộ**:

    - Chạy lệnh:
        ```bash
        ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
        ```
    - Nhấn Enter để dùng mặc định (tạo file `~/.ssh/id_rsa` và `id_rsa.pub`).

2. **Thêm Public Key vào VPS**:

    - Sao chép nội dung của `id_rsa.pub`:
        ```bash
        cat ~/.ssh/id_rsa.pub
        ```
    - Trên VPS, thêm vào file `~/.ssh/authorized_keys`:
        ```bash
        echo "your-public-key" >> ~/.ssh/authorized_keys
        ```
    - Đảm bảo quyền:
        ```bash
        chmod 600 ~/.ssh/authorized_keys
        chmod 700 ~/.ssh
        ```

3. **Lưu Private Key**:
    - Nội dung file `id_rsa` sẽ được dùng trong GitHub Actions lưu vào VPS_SSH_KEY.
    - Sao chép nội dung của `id_rsa`:
        ```bash
        cat ~/.ssh/id_rsa.pub
        ```

---

### **Bước 3: Cấu hình GitHub Actions**

1. **Tạo workflow**:

    - Trong repository GitHub, tạo thư mục `.github/workflows` (nếu chưa có).
    - Tạo file `deploy.yml` trong `.github/workflows/` với nội dung sau:

        ```yaml
        name: Deploy Node.js App
        ```

on:
push:
branches: - main

jobs:
build-and-deploy:
runs-on: ubuntu-latest
environment: production
steps: - name: Checkout code
uses: actions/checkout@v2

            - name: Login to Docker Hub
              uses: docker/login-action@v1
              with:
                  username: ${{ secrets.DOCKER_HUB_USERNAME }}
                  password: ${{ secrets.DOCKER_HUB_TOKEN }}

            - name: Build and push Docker image
              run: |
                  docker build -t nguyentanninh123/discordbot:latest .
                  docker push nguyentanninh123/discordbot:latest

            - name: Deploy to VPS
              uses: appleboy/ssh-action@master
              with:
                  host: ${{ secrets.VPS_HOST }}
                  username: ${{ secrets.VPS_USERNAME }}
                  key: ${{ secrets.VPS_SSH_KEY }}
                  script: |
                      docker pull nguyentanninh123/discordbot:latest
                      docker stop discordbot || true
                      docker rm discordbot || true
                      docker run -d --name discordbot -p 3000:3000 nguyentanninh123/discordbot:latest

        ```

2. **Giải thích workflow**:
    - `on: push`: Chạy khi push code lên branch `main`.
    - `docker/login-action`: Đăng nhập Docker Hub.
    - `docker build` & `docker push`: Build và đẩy image lên Docker Hub.
    - `appleboy/ssh-action`: Kết nối VPS qua SSH và chạy các lệnh để cập nhật container.

---

### **Bước 4: Thêm Secrets vào GitHub**

1. Vào repository trên GitHub:
    - Settings > Secrets and variables > Actions > New repository secret.
2. Thêm các secrets sau:
    - `DOCKER_USERNAME`: Tên người dùng Docker Hub.
    - `DOCKER_PASSWORD`: Token truy cập Docker Hub (tạo trong Docker Hub > Account Settings > Security).
    - `VPS_HOST`: Địa chỉ IP của VPS (ví dụ: `123.456.78.90`).
    - `VPS_USERNAME`: Tên người dùng trên VPS (thường là `root` hoặc tài khoản khác).
    - `VPS_SSH_KEY`: Nội dung file `id_rsa` (private key).

---

### **Bước 5: Kiểm tra và chạy**

1. **Push code lên GitHub**:

    - Commit và push thay đổi:
        ```bash
        git add .
        git commit -m "Add GitHub Actions for deployment"
        git push origin main
        ```

2. **Xem kết quả**:

    - Vào tab **Actions** trên GitHub để theo dõi workflow chạy.
    - Nếu thành công, ứng dụng sẽ tự động cập nhật trên VPS.

3. **Truy cập ứng dụng**:
    - Mở trình duyệt: `http://your-vps-ip:3000`.

---

### **Bước 6: Tối ưu và bảo mật**

1. **Kiểm tra logs**:
    - Trên VPS:
        ```bash
        docker logs my-app
        ```
2. **Tự động khởi động lại**:
    - Sửa lệnh trong `deploy.yml` để thêm `--restart unless-stopped`:
        ```bash
        docker run -d -p 3000:3000 --restart unless-stopped --name my-app ${{ secrets.DOCKER_USERNAME }}/my-node-app:latest
        ```
3. **Bảo mật SSH**:
    - Không lưu SSH key ở nơi công khai. Chỉ dùng trong Secrets.

---

### **Kết quả**

-   Mỗi khi bạn push code lên branch `main`, GitHub Actions sẽ:
    1. Build Docker image.
    2. Đẩy lên Docker Hub.
    3. Kéo image về VPS và chạy lại container.
-   Quá trình hoàn toàn tự động, bạn chỉ cần kiểm tra logs nếu có lỗi.
