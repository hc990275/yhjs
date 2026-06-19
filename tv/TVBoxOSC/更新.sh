#!/system/bin/sh

TVBOX_DIR="/data/media/0/TVBoxOSC"
DOWNLOAD_DIR="/data/media/0"
JSON_URL="https://pizazz.s3.bitiful.net/single.json"

ZIP_FILE="$TVBOX_DIR/update.zip"
HASH_FILE="$TVBOX_DIR/.sha256"

RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'

mkdir -p "$TVBOX_DIR"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "      TVBoxOSC 更新工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# 获取下载地址
JSON=$(curl -s -H "User-Agent: okhttp/4.12.0" "$JSON_URL")
DOWNLOAD_URL=$(echo "$JSON" | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 | grep '\.zip' | tail -n1)

if [ -z "$DOWNLOAD_URL" ]; then
    echo -e "${RED}❌ 未找到下载地址${NC}"
    exit 1
fi

echo -e "${BLUE}📥 下载地址:${NC} $DOWNLOAD_URL"
echo

# 下载文件（静默模式，只有错误会显示）
echo -e "${BLUE}📥 开始下载...${NC}"
if command -v aria2c >/dev/null 2>&1; then
    aria2c -q -x16 -s16 -k1M --continue=true -d "$TVBOX_DIR" -o "update.zip" "$DOWNLOAD_URL"
elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$ZIP_FILE" "$DOWNLOAD_URL"
else
    curl -sSL -o "$ZIP_FILE" "$DOWNLOAD_URL"
fi

if [ ! -f "$ZIP_FILE" ]; then
    echo -e "${RED}❌ 下载失败${NC}"
    exit 1
fi

# 计算哈希
if command -v sha256sum >/dev/null 2>&1; then
    NEW_HASH=$(sha256sum "$ZIP_FILE" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
    NEW_HASH=$(shasum -a 256 "$ZIP_FILE" | awk '{print $1}')
else
    echo -e "${YELLOW}⚠️ 未找到 SHA256 工具，无法判断更新${NC}"
    NEW_HASH=""
fi

echo -e "${BLUE}🔑 文件哈希:${NC} $NEW_HASH"

OLD_HASH=""
[ -f "$HASH_FILE" ] && OLD_HASH=$(cat "$HASH_FILE")

if [ -n "$NEW_HASH" ] && [ "$NEW_HASH" = "$OLD_HASH" ]; then
    echo -e "${GREEN}✅ 文件未变化${NC}"
    rm -f "$ZIP_FILE"
    exit 0
else
    echo -e "${YELLOW}⚠️ 文件有变化，开始解压${NC}"
fi

# 解压
if command -v unzip >/dev/null 2>&1; then
    unzip -oq "$ZIP_FILE" -d "$DOWNLOAD_DIR"
elif command -v busybox >/dev/null 2>&1; then
    busybox unzip -o "$ZIP_FILE" -d "$DOWNLOAD_DIR"
else
    echo -e "${RED}❌ 未找到 unzip 工具${NC}"
    exit 1
fi

# 保存新哈希并删除压缩包
[ -n "$NEW_HASH" ] && echo "$NEW_HASH" > "$HASH_FILE"
rm -f "$ZIP_FILE"

echo -e "${GREEN}✅ 更新完成${NC}"
echo -e "${BLUE}📂 解压目录:${NC} $DOWNLOAD_DIR"