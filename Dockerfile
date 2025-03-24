# Dockerfile
FROM node:18

# Tạo thư mục ứng dụng
WORKDIR /app

# Sao chép package.json và package-lock.json
COPY package*.json ./

# Cài đặt các dependencies
RUN npm install

# Sao chép toàn bộ mã nguồn
COPY . .

# Copy the .env file
COPY .env .env

# Expose port
EXPOSE 3000

# Chạy ứng dụng
CMD ["npm", "start"]