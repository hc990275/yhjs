#!/bin/bash

# 当前脚本版本
SCRIPT_VERSION="v8.00"

# 调试模式开关 (false)
DEBUG="false"

# !!! 重要：请根据您的 Android 设备路径修改以下两个目录 !!!
# 例如: /storage/emulated/0/Download/APK_Updates/版本文件夹
VERSION_DIR="/storage/emulated/0/0网站/下载专用/影视安装包更新/版本文件夹"
# 例如: /storage/emulated/0/Download/APK_Updates/下载文件
DOWNLOAD_DIR="/storage/emulated/0/0网站/下载专用/影视安装包更新"
# --- 请根据您的实际路径修改 ↑↑↑ ---

# 确保下载目录和版本文件夹存在
mkdir -p "$VERSION_DIR"
mkdir -p "$DOWNLOAD_DIR"


# 设置 GitHub 用户代理
user_agent="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36 EdgA/121.0.0.0"

# 下载加速服务地址，默认为空，表示不加速
ACCELERATION_BASE_URL=""

# 可选的加速服务列表，用户可以选择
declare -A ACCELERATION_OPTIONS=(
    ["1"]="不加速 (默认，可能需要 VPN/梯子)"
    ["2"]="加速服务1 (https://gh.xxooo.cf)"
    ["3"]="代理服务 - gh-proxy.com (备选代理，需测试)"
)

# TVbox 接口列表 (从用户提供的信息中提取) - 初始为空，提取后填充
declare -A TVBOX_INTERFACES=()

# 随机颜色函数 (仅用于 print_color)
random_color() {
    echo $((31 + RANDOM % 7))  # 从 31 到 37 的颜色代码
}

# 带颜色的打印函数（加高亮和空格）
print_color() {
    color_code=$(random_color)
    echo -e "\e[${color_code}m\e[1m$1\e[0m"  # 使用 ANSI 颜色代码和高亮
    # echo ""  # 移除额外空行，让日志更紧凑
}

# 检查 MT 管理器拓展包是否安装 (此检查保留，提示用户运行环境)
check_mt_extension() {
    print_color "🔍 正在检测 MT 管理器拓展包..."
    if pm list packages | grep -q "bin.mt.termex"; then
        print_color "✅ MT 管理器拓展包已安装"
    else
        print_color "❌ 未检测到 MT 管理器拓展包"
        print_color "⚠️ 强烈建议使用 MT 管理器拓展包环境运行脚本，不要使用系统环境。"
    fi
    echo "" # 增加空行
    print_color "请使用拓展包环境运行，不要使用系统环境运行。"
    echo "" # 增加空行
}

# 打印脚本版本
print_script_version() {
    print_color "🌟 当前脚本版本: $SCRIPT_VERSION"
}

# 检查并更新脚本 (使用 [ ] 替换 [[ ]] 增强 sh 兼容性)
check_and_update_script() {
    print_color "🔍 正在检查脚本更新..."

    # 获取最新发布信息
    local api_url="https://api.github.com/repos/$REPO/releases/latest"
    local response=$(curl -s -A "$user_agent" "$api_url")

    # 检查 curl 是否成功获取响应
    if [ $? -ne 0 ] || [ -z "$response" ]; then
        print_color "❌ 无法获取最新版本信息 (curl 错误或无响应)，跳过更新。"
        return
    fi

    # 提取 tag_name 和 sh 文件下载 URL
    # 尝试使用 awk 进行更健壮的 JSON 提取
    local latest_version=$(echo "$response" | awk -F'"' '/"tag_name":/ {print $4}')
    local download_url=$(echo "$response" | awk -F'"' '/"browser_download_url":/ {for(i=1;i<NF;i++){if($i ~ /\.sh$/){print $(i+1); exit}}}')


    # 如果获取失败，则退出
    if [ -z "$latest_version" ] || [ -z "$download_url" ]; then
        print_color "❌ 无法从响应中解析版本或下载地址，跳过更新。"
        return
    fi

    # 检查版本号 (使用 [ ] 替换 [[ ]])
    if [ "$latest_version" != "$SCRIPT_VERSION" ]; then
        print_color "⬇️ 发现新版本：$SCRIPT_VERSION -> $latest_version，正在更新..."
        local new_script_name="软件更新脚本_$latest_version.sh"
        local old_script_name="$0" # 获取当前脚本文件名

        # 下载新版本脚本，使用 -L 跟随重定向
        curl -s -L -A "$user_agent" -o "$new_script_name" "$download_url"

        # 检查下载文件是否存在且非空
        if [ -f "$new_script_name" ] && [ -s "$new_script_name" ]; then
            chmod +x "$new_script_name"
            print_color "✅ 更新完成，新的脚本已下载为: $new_script_name"

            # 删除旧脚本
            rm -f "$old_script_name"
            print_color "🧹 旧脚本已删除: $old_script_name"

            print_color "🔁 请退出当前脚本并手动运行新脚本：$new_script_name"
            exit 0  # 退出当前脚本
        else
            print_color "❌ 脚本下载失败或文件为空，保持当前版本。"
            rm -f "$new_script_name" # 清理失败的下载文件
        fi
    else
        print_color "✅ 脚本已是最新版本（$SCRIPT_VERSION）"
    fi
}

# 询问用户是否使用加速服务 (使用 case 语句增强 sh 兼容性)
ask_acceleration_preference() {
    print_color "🚀 请选择下载加速服务："
    local options=("${!ACCELERATION_OPTIONS[@]}")
    local num_options=${#options[@]}

    for key in "${options[@]}"; do
        print_color "   ${key}. ${ACCELERATION_OPTIONS[$key]}"
    done

    local choice
    read -p "请选择 (1-${num_options}): " choice

    case "$choice" in
        1)
            ACCELERATION_BASE_URL="" # 选项 1，不加速
            print_color "✅ 已选择: ${ACCELERATION_OPTIONS[$choice]}"
            ;;
        2)
            ACCELERATION_BASE_URL="https://gh.xxooo.cf" # 选项 2，加速服务1
            print_color "✅ 已选择: ${ACCELERATION_OPTIONS[$choice]}"
            ;;
        3)
            ACCELERATION_BASE_URL="https://gh-proxy.com" # 选项 3，代理服务 - gh-proxy.com
            print_color "✅ 已选择: ${ACCELERATION_OPTIONS[$choice]}"
            ;;
        *) # 默认情况 (包括空输入或非法输入)
            ACCELERATION_BASE_URL=""
            print_color "❌ 无效选择或跳过，已设置为不加速 (默认)"
            ;;
    esac
    echo "" # 增加空行
}


# APK JSON 下载地址 (更新为 Python 版本使用的 lystv/fmapp 地址)
declare -A urls=(
    ["OK版手机"]="https://raw.githubusercontent.com/lystv/fmapp/main/apk/release/mobile.json"
    ["OK版电视"]="https://raw.githubusercontent.com/lystv/fmapp/main/apk/release/leanback.json"
    ["蜜蜂版手机"]="https://raw.githubusercontent.com/FongMi/Release/fongmi/apk/release/mobile.json" # 蜜蜂版地址不变
    ["蜜蜂版电视"]="https://raw.githubusercontent.com/FongMi/Release/fongmi/apk/release/leanback.json" # 蜜蜂版地址不变
    ["OK版Pro"]="https://raw.githubusercontent.com/lystv/fmapp/ok/apk/pro/v.txt" # 更新 OK版Pro JSON 地址
)

# APK 下载链接 (更新为 Python 版本使用的 lystv/fmapp 和 FongMi/Release 地址)
# 值存储的是相对 GitHub 仓库根目录的路径，例如 lystv/fmapp/main/apk/...
declare -A apk_links=(
    # OK版 (使用 lystv/fmapp 仓库, main 分支, 不区分 Java/Python)
    ["OK版手机_32"]="lystv/fmapp/main/apk/release/mobile-armeabi_v7a.apk"
    ["OK版手机_64"]="lystv/fmapp/main/apk/release/mobile-arm64_v8a.apk"

    ["OK版电视_32"]="lystv/fmapp/main/apk/release/leanback-armeabi_v7a.apk"
    ["OK版电视_64"]="lystv/fmapp/main/apk/release/leanback-arm64_v8a.apk"

    # OK海信专版 (与OK版手机版本号一致)
    ["OK海信专版_APK"]="lystv/fmapp/main/apk/release/%E6%B5%B7%E4%BF%A1%E4%B8%93%E7%89%88.apk" # URL 编码的 "海信专版"

    # OK安卓4版本 (KitKat), 独立下载 (链接已包含在内，但默认不走主更新流程，除非修改下方逻辑)
    ["OK安卓4版本_APK"]="lystv/fmapp/main/apk/kitkat/leanback.apk"

# 蜜蜂版 (使用 FongMi/Release 仓库, fongmi 分支, 只区分32/64位)
    ["蜜蜂版手机_32"]="FongMi/Release/fongmi/apk/release/mobile-armeabi_v7a.apk"
    ["蜜蜂版手机_64"]="FongMi/Release/fongmi/apk/release/mobile-arm64_v8a.apk"

    ["蜜蜂版电视_32"]="FongMi/Release/fongmi/apk/release/leanback-armeabi_v7a.apk"
    ["蜜蜂版电视_64"]="FongMi/Release/fongmi/apk/release/leanback-arm64_v8a.apk"

    # OK版Pro (使用 lystv/fmapp 仓库, ok 分支) - 更新路径格式
    ["OK版Pro_手机Pro"]="lystv/fmapp/ok/apk/pro/mobile-pro.apk"
    ["OK版Pro_手机emu-Pro"]="lystv/fmapp/ok/apk/pro/mobile-emu-pro.apk"
    ["OK版Pro_电视Pro"]="lystv/fmapp/ok/apk/pro/leanback-pro.apk"
)


# 下载 JSON 并比较版本号 (兼容 OK版Pro 的 v.txt 纯文本版本号)
check_json_update() {
    local name=$1
    local url="${urls[$name]}"
    local old_json_file="$VERSION_DIR/$name.json"
    local temp_json_file="$VERSION_DIR/${name}临时.json"

    print_color "--- 检查 $name 的版本 ---"

    # 构建最终下载 URL (应用加速服务)
    local final_json_url="$url"
    if [[ -n "$ACCELERATION_BASE_URL" ]]; then
        # 需要提取原始 raw.githubusercontent.com/ 后面的路径部分
        # 例如从 https://raw.githubusercontent.com/lystv/fmapp/main/apk/...
        # 提取 lystv/fmapp/main/apk/...
        local github_path=$(echo "$url" | sed 's|https://raw.githubusercontent.com/||')
        final_json_url="${ACCELERATION_BASE_URL}/${github_path}"
    fi

    # 下载新 JSON 到临时文件
    curl -s -L -A "$user_agent" -o "$temp_json_file" "$final_json_url"

    # 检查 curl 是否成功下载临时文件且文件非空
    if [ $? -ne 0 ] || [ ! -s "$temp_json_file" ]; then
        print_color "❌ 下载或文件为空失败: $name JSON 文件 (${final_json_url})"
        rm -f "$temp_json_file" # 清理失败的下载文件
        return 1  # 返回失败
    fi

    local old_version=""
    local new_version=""

    # 判断并提取旧版本号
    if [[ -f "$old_json_file" ]]; then
        if [[ "$name" == "OK版Pro" ]]; then
            old_version=$(head -n 1 "$old_json_file" | tr -d '\r')
        else
            # 使用 grep 和 cut 提取 JSON 中的 "name" 字段
            # 假设 "name" 字段格式稳定且在一行
            old_version=$(grep '"name"' "$old_json_file" | head -n 1 | cut -d '"' -f 4)
        fi
    fi

    # 判断并提取新版本号
     if [[ "$name" == "OK版Pro" ]]; then
        new_version=$(head -n 1 "$temp_json_file" | tr -d '\r')
    else
        # 使用 grep 和 cut 提取 JSON 中的 "name" 字段
        new_version=$(grep '"name"' "$temp_json_file" | head -n 1 | cut -d '"' -f 4)
    fi

    # 输出版本号信息 (如果提取失败，则可能为空)
    print_color "  旧版本号: ${old_version:-未找到/解析失败}" # 使用 :- 打印默认值如果变量为空
    print_color "  新版本号: ${new_version:-未找到/解析失败}"

    # 版本号对比更新 (确保新版本号非空且与旧版本不同)
    if [[ -n "$new_version" ]] && [ "$new_version" != "$old_version" ]; then
        print_color "🔄 发现新版本：${old_version:-无} -> $new_version"
        # 下载成功才替换，将临时文件重命名为正式文件
        mv -f "$temp_json_file" "$old_json_file"
        print_color "  本地版本信息已更新."
        return 0 # 返回成功 (有更新)
    else
        print_color "✅ 版本未变更或新版本信息无效，无需更新."
        # 即使版本未更新，也删除临时文件，保持目录整洁
        rm -f "$temp_json_file"
        return 1  # 返回失败 (没有更新)
    fi
}

# 下载 APK
download_apk() {
    local apk_key=$1 # 使用 apk_key 作为参数名
    local relative_github_path="${apk_links[$apk_key]}"

    # 原始 raw URL
    local original_apk_url="https://raw.githubusercontent.com/${relative_github_path}"

    # 应用加速服务 (加速服务地址 + GitHub 仓库/分支/路径)
    local final_apk_url="$original_apk_url" # 默认为原始 URL
    if [[ -n "$ACCELERATION_BASE_URL" ]]; then
        final_apk_url="${ACCELERATION_BASE_URL}/${relative_github_path}"
    fi

    # 清理文件名后缀以便保存
    local clean_apk_name=$(echo "$apk_key" | sed 's/_PY32$//; s/_PY64$//; s/_JAVA32$//; s/_JAVA64$//; s/_32$//; s/_64$//; s/_APK$//')
    local apk_path="$DOWNLOAD_DIR/$clean_apk_name.apk"
    local temp_apk_path="$DOWNLOAD_DIR/${clean_apk_name}临时.apk"

    print_color "⬇️ 正在下载: $clean_apk_name.apk"
    # print_color "  源地址: $final_apk_url" # 调试时打印源地址

    # 使用 wget 下载，显示进度条，输出到临时文件
    # -q 安静模式，除了进度条不输出其他信息
    # --show-progress 显示进度条
    # -O 指定输出文件
    # --user-agent 设置 User-Agent
    # --timeout 设置超时时间
    wget -q --show-progress -O "$temp_apk_path" --user-agent="$user_agent" --timeout=120 "$final_apk_url"
    # 或者使用 curl 下载并显示进度
    # curl -L -# -A "$user_agent" -o "$temp_apk_path" --connect-timeout 10 --max-time 120 "$final_apk_url"


    local download_exit_status=$? # 获取下载命令的退出状态

    # 检查下载是否成功 (退出状态为0且文件非空)
    if [ $download_exit_status -eq 0 ] && [ -s "$temp_apk_path" ]; then
        print_color "✅ 下载完成: $clean_apk_name.apk"
        mv -f "$temp_apk_path" "$apk_path" # 移动临时文件到正式位置
    else
        print_color "❌ 下载失败: $clean_apk_name.apk (错误码: $download_exit_status)"
        rm -f "$temp_apk_path" # 清理失败的下载文件
    fi
}

# 从 饭太硬 网站提取接口地址
extract_fantaiying_interfaces() {
    print_color "🔍 正在从 饭太硬 网站提取接口地址..."
    local jkurl="https://www.xn--sss604efuw.com/"
    local content=$(curl -s "$jkurl")

    if [ $? -ne 0 ] || [ -z "$content" ]; then
        print_color "❌ 无法获取 饭太硬 网站内容，跳过提取。"
        return
    fi

    echo "$content" | awk 'BEGIN {
      FS="data-clipboard-text=\""
      srand()
      # ANSI 颜色代码（不加高亮）
      colors[1]="\033[0;31m" # Red
      colors[2]="\033[0;32m" # Green
      colors[3]="\033[0;33m" # Yellow
      colors[4]="\033[0;34m" # Blue
      colors[5]="\033[0;35m" # Magenta
      colors[6]="\033[0;36m" # Cyan
      NC="\033[0m" # No Color
    }
    /data-clipboard-text=/ {
      # 随机选择颜色
      color_index = int(rand() * 6) + 1
      color = colors[color_index]

      split($2,a,"\"")
      interface_url = a[1]

      # 提取接口名称（这里简单固定，可以根据需要从页面内容提取）
      interface_name="饭太硬接口"

      # 存储到关联数组 (awk 无法直接修改外部 Shell 数组，只能打印出来让 Shell 捕获或 eval)
      # 为了简化，这里直接打印，Shell 脚本需要自己解析awk的输出
      printf "饭太硬接口:%s\n", interface_url # 以固定格式打印，方便 Shell 解析
      printf "  %s%s%s\n", color, interface_url, NC # 终端显示带颜色
    }' | while read -r line; do
        # Shell 脚本解析 awk 输出并存储到 TVBOX_INTERFACES
        if [[ "$line" == "饭太硬接口:"* ]]; then
            interface_url="${line#饭太硬接口:}"
            TVBOX_INTERFACES["饭太硬接口"]="$interface_url"
        fi
    done
    echo ""
}

# 从 片库 提取接口地址
extract_pianku_interfaces() {
    print_color "🔍 正在从 片库 提取接口地址..."
    local jkurl1="https://jihulab.com/pk1/pianku/-/raw/master/square.json"
    local content=$(curl -s "$jkurl1")

    if [ $? -ne 0 ] || [ -z "$content" ]; then
        print_color "❌ 无法获取 片库 JSON 内容，跳过提取。"
        return
    fi

    # 使用 grep 和 sed 提取 URL，然后 awk 格式化和着色
    echo "$content" | grep -o '"url":"[^"]*"' | sed 's/"url":"//; s/"$//' | awk 'BEGIN {
      srand()
      # ANSI 颜色代码（不加高亮）
      colors[1]="\033[0;31m" # Red
      colors[2]="\033[0;32m" # Green
      colors[3]="\033[0;33m" # Yellow
      colors[4]="\033[0;34m" # Blue
      colors[5]="\033[0;35m" # Magenta
      colors[6]="\033[0;36m" # Cyan
      NC="\033[0m" # No Color
    }
    {
      # 随机选择颜色
      color_index = int(rand() * 6) + 1
      color = colors[color_index]
      interface_url = $0 # awk 接收到的整行就是 URL

      # 提取接口名称（这里简单固定）
      interface_name="片库接口"

      # 存储到关联数组 (awk 无法直接修改外部 Shell 数组)
      # 为了简化，这里直接打印，Shell 脚本需要自己解析awk的输出
      printf "片库接口:%s\n", interface_url # 以固定格式打印，方便 Shell 解析
      printf "  %s%s%s\n", color, interface_url, NC # 终端显示带颜色
    }' | while read -r line; do
        # Shell 脚本解析 awk 输出并存储到 TVBOX_INTERFACES
         if [[ "$line" == "片库接口:"* ]]; then
            interface_url="${line#片库接口:}"
            TVBOX_INTERFACES["片库接口"]="$interface_url"
        fi
    done
    echo ""
}


# 打印 TVbox 接口列表
print_tvbox_interfaces() {
    echo "" # 增加空行
    print_color "📢 欢迎关注我的公众号："
    print_color "👉 阿博可行笔记 | 阿博AI"
    print_color "获取更多实用工具和技术分享！"
    echo ""

    print_color "**TVbox 接口 (自动提取)**"
    if [ ${#TVBOX_INTERFACES[@]} -eq 0 ]; then # 检查数组是否为空
        print_color "❌ 未能提取到接口地址，请检查网站是否可访问或解析规则是否有效。"
    else
        # 打印存储在 Shell 关联数组中的接口
        for name in "${!TVBOX_INTERFACES[@]}"; do
            interface_url="${TVBOX_INTERFACES[$name]}"
            print_color "  * ${name}: ${interface_url}" # 打印不带颜色的原始 URL
        done
    fi
    echo ""
}



# --- 脚本主流程 ---
check_mt_extension # 检查 MT 管理器拓展包
print_script_version # 打印脚本版本
check_and_update_script # 检查脚本自身更新
ask_acceleration_preference # 询问是否使用加速服务


print_color "===== APK 更新检查开始 ====="

# 检查 JSON 更新并下载 APK
# 遍历 urls 关联数组的所有键 (版本类型名称)
for name in "${!urls[@]}"; do
    # 调用 check_json_update 检查当前版本是否有更新，如果返回 0 表示有更新
    if check_json_update "$name"; then
        print_color "$name 检测到有新版本，准备下载相关 APK..."
        # 定义一个临时数组用于存储当前版本需要下载的 APK 的 key
        apks_to_download=()

        # 根据版本名称 (name) 确定要下载哪些 APK 的 key，并添加到 apks_to_download 数组
        if [[ "$name" == "OK版Pro" ]]; then
            apks_to_download=(
                "OK版Pro_手机Pro"
                "OK版Pro_手机emu-Pro"
                "OK版Pro_电视Pro"
            )
        elif [[ "$name" == "OK版手机" ]]; then
            # OK版手机 (不区分 Java/Python, 只区分 32/64) 且包含海信专版
            apks_to_download=(
                "OK版手机_32"
                "OK版手机_64"
                "OK海信专版_APK" # 添加海信专版到下载列表
            )
            print_color "  包含 OK 海信专版 APK (版本号与 OK版手机一致)."
        elif [["$name" == "OK版电视" ]]; then
             # OK版电视 (不区分 Java/Python, 只区分 32/64)
             apks_to_download=(
                "OK版电视_32"
                "OK版电视_64"
            )
        elif [[ "$name" == "蜜蜂版手机" || "$name" == "蜜蜂版电视" ]]; then
             # 蜜蜂版手机 和 蜜蜂版电视 (只区分 32/64)
             apks_to_download=(
                "${name}_32"
                "${name}_64"
            )
        fi
        # 注意：OK安卓4版本_APK 不包含在主更新流程中，需要单独逻辑下载，此处忽略。

        # 遍历 apks_to_download 数组，逐个下载 APK
        if [ ${#apks_to_download[@]} -gt 0 ]; then # 检查列表是否不为空
            for apk_key in "${apks_to_download[@]}"; do
                # 检查要下载的 apk_key 是否在全局 apk_links 数组中定义
                if [[ -n "${apk_links[$apk_key]}" ]]; then
                    download_apk "$apk_key" # 调用 download_apk 函数进行下载
                else
                    print_color "⚠️ 警告: APK key '$apk_key' 未在 apk_links 数组中找到定义，跳过下载."
                fi
            done
        else
             print_color "  ${name} 检测到更新，但根据规则无需下载特定 APK."
        fi

    fi # check_json_update "$name"

    print_color "-"*20 # 分隔不同版本的检查输出
done # for name in "${!urls[@]}"


extract_fantaiying_interfaces # 提取饭太硬接口
#extract_pianku_interfaces # 提取片库接口 (如果需要，取消注释此行)

print_tvbox_interfaces # 打印提取到的 TVbox 接口

print_color "🎉 脚本全部操作完成！"