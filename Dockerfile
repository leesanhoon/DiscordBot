# Sử dụng image base nhẹ (Alpine) thay vì Debian
FROM node:18-alpine AS builder

# Đặt biến môi trường cho production
ENV NODE_ENV=production

# Tạo thư mục làm việc
WORKDIR /app

# Sao chép package.json và package-lock.json
COPY package*.json ./

# Cài dependencies chỉ cho production
RUN npm ci --production --ignore-scripts \
    && npm cache clean --force

# Sao chép mã nguồn (loại trừ file không cần qua .dockerignore)
COPY . .

# Stage production
FROM node:18-alpine

# Đặt biến môi trường
ENV NODE_ENV=production \
    PORT=3000

# Tạo user non-root để tăng bảo mật
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Đặt thư mục làm việc
WORKDIR /app

# Copy chỉ file cần thiết từ stage builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app ./

# Chuyển sang user non-root
USER appuser

# Expose port từ biến môi trường
EXPOSE ${PORT}

# Health check để kiểm tra ứng dụng
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Chạy ứng dụng
CMD ["npm", "start"]