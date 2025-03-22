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
        name: Build and Deploy to VPS

        on:
            push:
                branches:
                    - main # Thay đổi nếu branch chính của bạn khác

        jobs:
            build-and-deploy:
                runs-on: ubuntu-latest
                environment: production

                steps:
                    # Checkout mã nguồn
                    - name: Checkout code
                      uses: actions/checkout@v3

                    # Đăng nhập Docker Hub
                    - name: Login to Docker Hub
                      uses: docker/login-action@v2
                      with:
                          username: ${{ secrets.DOCKER_USERNAME }}
                          password: ${{ secrets.DOCKER_PASSWORD }}

                    # Deploy lên VPS qua SSH
                    - name: Deploy to VPS
                      uses: appleboy/ssh-action@master
                      with:
                          host: ${{ secrets.VPS_HOST }}
                          username: ${{ secrets.VPS_USERNAME }}
                          key: ${{ secrets.VPS_SSH_KEY }}
                          script: |
                              docker pull ${{ secrets.DOCKER_USERNAME }}/my-node-app:latest
                              docker stop my-app || true
                              docker rm my-app || true
                              docker run -d -p 3000:3000 --name my-app ${{ secrets.DOCKER_USERNAME }}/my-node-app:latest
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
