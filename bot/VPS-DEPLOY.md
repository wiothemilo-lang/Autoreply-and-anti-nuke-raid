# 🚀 Protogon Bot — VPS Deployment Guide

# Target: 1-1 VPS (1 vCPU, 1GB RAM) — 55.000đ/tháng

# Hoặc: 1-2 VPS (1 vCPU, 2GB RAM) — 75.000đ/tháng

> 🔁 **Đang chuyển sang VPS node khác (không phải cài lần đầu)?** Xem runbook
> chuyên biệt: [`docs/migrate-node.md`](../docs/migrate-node.md) — giữ session
> Discord, checklist cutover + rollback.

## Yêu cầu

- VPS chạy Ubuntu 22.04/24.04 hoặc Debian 12
- SSH root access
- ≥ 1GB RAM (+ 1GB swap được tạo tự động)

## Bước 1: Setup VPS

```bash
# SSH vào VPS
ssh root@YOUR_VPS_IP

# Tải và chạy script setup
curl -fsSL https://raw.githubusercontent.com/.../bot/scripts/vps-setup.sh | bash
# Hoặc copy file rồi chạy:
# bash vps-setup.sh
```

## Bước 2: Upload bot

```bash
# Từ máy local
scp protogon-bot.zip root@YOUR_VPS_IP:/opt/protogon/

# Trên VPS
cd /opt/protogon
unzip protogon-bot.zip
cd bot
npm install --omit=dev
```

## Bước 3: Cấu hình .env

```bash
nano /opt/protogon/bot/.env
```

Thêm nội dung:

```
DISCORD_TOKEN=your_bot_token_here
CONVEX_URL=your_convex_deployment_url
```

## Bước 4: Start với PM2

```bash
cd /opt/protogon/bot
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable auto-start on boot
```

## Bước 5: Kiểm tra

```bash
pm2 list          # Xem status
pm2 logs          # Xem logs realtime
pm2 monit         # Monitor CPU + RAM realtime
memcheck          # Script kiểm tra memory
```

## Useful Commands

```bash
pm2 restart protogon-bot     # Restart bot
pm2 stop protogon-bot        # Stop bot
pm2 delete protogon-bot      # Remove bot
pm2 update                   # Update PM2
pm2 save                     # Save current state
```

## Memory Tips (cho 1GB RAM)

- Script `vps-setup.sh` đã tạo 1GB swap → bắt buộc
- `ecosystem.config.js` limit RAM 700MB → còn 300MB cho OS
- `node --max-old-space-size=640` → giới hạn V8 heap
- Cache sweep mỗi 5 phút → frees memory định kỳ
- Sync loop mỗi 2 phút → giảm CPU spikes

## Backup

```bash
# Manual backup config
cp /opt/protogon/bot/.env /root/.env.backup

# PM2 backup
pm2 save
```

## Troubleshooting

```bash
# Bot crash loop?
pm2 logs protogon-bot --lines 50

# Memory full?
free -h
pm2 monit
# Nếu swap > 50% → cần upgrade VPS hoặc tối ưu thêm

# Bot không online?
pm2 restart protogon-bot
pm2 logs protogon-bot --lines 20
```
