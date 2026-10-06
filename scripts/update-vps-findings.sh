#!/usr/bin/env bash
# ============================================================================
# update-vps-findings.sh — cập nhật findings thực tế VPS vào tài liệu
# (chạy từ gốc repo sau `git pull` + kiểm chứng xanh)
#
# CHỈ CHẠY TRÊN VPS — không thêm vào CI (chứa đặc tả môi trường);
# output file docs/vps-audit-YYYY-MM-DD.md cũng không commit.
# ============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TODAY="$(date +%Y-%m-%d)"
LOG_FILE="$REPO_DIR/docs/vps-audit-$TODAY.md"

# Không dùng cho commit: file output chứa đặc tả môi trường VPS.
# Khi chạy trên VPS thực, LOG_FILE = /opt/Autoreply-and-anti-nuke-raid/docs/vps-audit-YYYY-MM-DD.md
# (không track by git — nằm ngoài tracked tree scope).


# ── 1. Thông tin VPS ────────────────────────────────────────────────────────
HOSTNAME="$(hostname)"
IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
MEM_TOTAL="$(free -h 2>/dev/null | awk '/^Mem:/{print $2}')"
MEM_USED="$(free -h 2>/dev/null | awk '/^Mem:/{print $3}')"
MEM_AVAIL="$(free -h 2>/dev/null | awk '/^Mem:/{print $7}')"
LOAD="$(uptime | awk -F'load average:' '{print $2}' | xargs)"
UPTIME="$(uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | awk '{print $1}')"

# ── 2. Bot state ────────────────────────────────────────────────────────────
PM2_STATUS="$(pm2 list 2>/dev/null | grep -E 'protogon-bot|online|errored|stopped' || true)"
BOT_HEALTH="$(pm2 logs protogon-bot --lines 1 --nostream 2>/dev/null | tail -1 || true)"
BOT_HEAP="$(pm2 describe protogon-bot 2>/dev/null | grep -E 'Heap Usage|Heap Size' || true)"

# ── 3. Kiira proxy ──────────────────────────────────────────────────────────
KIIRA_HEALTH="$(curl -sS --max-time 3 http://127.0.0.1:8787/__health 2>/dev/null || echo "UNREACHABLE")"
KIIRA_UNIT="$(systemctl is-active kiira-retry-proxy 2>/dev/null || echo "NOT_FOUND")"

# ── 4. Network / DDoS trace ─────────────────────────────────────────────────
TCP_ESTAB="$(ss -s 2>/dev/null | awk '/TCP:/ {print $4}' | sed 's/(//' | tr -d ' ' || true)"
TCP_TIMEWAIT="$(ss -s 2>/dev/null | awk '/TCP:/ {for(i=1;i<=NF;i++) if($i ~ /timewait/) print $i}' | sed 's/.*: //' || true)"
TOP_IPS="$(ss -tanp 2>/dev/null | awk 'NR>1{split($5,a,":"); if(a[1]!="") print a[1]}' | sort -n | uniq -c | sort -rn | head -10 || true)"

# ── 5. Disk ─────────────────────────────────────────────────────────────────
DISK_USAGE="$(df -h / 2>/dev/null | awk 'NR==2{print $5, $4}' || true)"
REPO_SIZE="$(du -sh "$REPO_DIR" 2>/dev/null | awk '{print $1}')"

# ── 6. Git state ────────────────────────────────────────────────────────────
GIT_BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
GIT_LS_REMOTE="$(git -C "$REPO_DIR" status -s 2>/dev/null || true)"
LAST_COMMIT="$(git -C "$REPO_DIR" log -1 --oneline 2>/dev/null || true)"

# ── Viết file ───────────────────────────────────────────────────────────────
cat > "$LOG_FILE" << EOF
# 📋 VPS Audit Findings — $TODAY

> File sinh tự động sau mỗi lần `git pull` + kiểm chứng. Giữ lại để:
> - Theo dõi biến động tài nguyên / trạng thái bot theo thời gian
> - Soi dấu hiệu tấn công hoặc suy giảm hiệu năng
> - Là bằng chứng khi cần điều tra sự cố

> ⚠️ Nội dung này không commit lên repo (chứa đặc tả môi trường + secret
> fingerprint — có thể lộ thông tin VPS). Chỉ đọc trên VPS.

---

## 1. VPS thông tin

| Trường         | Giá trị                            |
| -------------- | ---------------------------------- |
| Hostname       | $HOSTNAME                          |
| IP (nếu có)    | ${IP:-chưa lấy được}               |
| RAM tổng       | ${MEM_TOTAL:-chưa lấy được}        |
| RAM đã dùng    | ${MEM_USED:-chưa lấy được}         |
| RAM còn lại    | ${MEM_AVAIL:-chưa lấy được}        |
| Load average   | ${LOAD:-chưa lấy được}             |
| Uptime         | ${UPTIME:-chưa lấy được}           |

## 2. Bot production (pm2 protogon-bot)

\`\`\`
$PM2_STATUS
\`\`\`

| Trường         | Giá trị                     |
| -------------- | --------------------------- |
| Heap usage     | ${BOT_HEAP:-không lấy được} |

Last bot log line:
> $BOT_HEALTH

## 3. Kiira retry proxy

| Trường       | Giá trị                              |
| ------------ | ----------------------------------- |
| systemctl    | $KIIRA_UNIT                          |
| /__health    | $KIIRA_HEALTH                        |

+ Nếu \`systemctl\` báo "NOT_FOUND" → proxy chưa cài.
+ Nếu \`/__health\` báo "UNREACHABLE" → proxy không listen trên port 8787.

## 4. Dấu hiệu DDoS / tắc cổ ch Ai

| Trường        | Giá trị                        |
| ------------- | ------------------------------ |
| TCP estab    | ${TCP_ESTAB:-chưa lấy được}     |
| timewait      | ${TCP_TIMEWAIT:-chưa lấy được}  |
| Top IPs       | \`\`\`                         |
${TOP_IPS}
\`\`\`

+ Nếu TCP estab < 50 và top IPs toàn Google/Freebuff/chrome → **không có DDoS tầng mạng**.
+ Nếu TCP estab > 1000 hoặc nhiều IP lạ cùng nap công suất → cảnh báo, kiểm tra nhà cung cấp.

## 5. Disk

| Trường     | Giá trị                 |
| ---------- | ----------------------- |
| / usage    | ${DISK_USAGE:-chưa lấy} |
| repo size  | ${REPO_SIZE:-chưa lấy}  |

## 6. Git repo state (sau pull)

| Trường         | Giá trị                    |
| -------------- | -------------------------- |
| Branch         | ${GIT_BRANCH:-chưa lấy}    |
| Working tree   | ${GIT_LS_REMOTE:-clean}    |
| Last commit    | ${LAST_COMMIT:-chưa lấy}   |

---

## 📌 Kết luận nhanh

- Nếu bot online + heap < 80% + TCP estab thấp + proxy OK → VPS khỏe, deploy an toàn.
- Nếu bot heap > 80% → cân nhắc restart sau kiểm chứng, rồi monitor.
- Nếu Kiira proxy missing → cài lại nếu dự án dựa vào nó; nếu không → bỏ qua.
- Nếu TCP estab lớn bất thường → khóa không deploy, kiểm tra nhà cung cấp VPS.

EOF

echo "✅ Wrote: $LOG_FILE"
