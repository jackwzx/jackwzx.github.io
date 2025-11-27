#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
target_dir="${script_dir}/../source/_posts"
mkdir -p "$target_dir"

publish_flag="1"
if [[ "$#" -ge 1 ]]; then
  publish_flag="$1"
fi
if [[ "$publish_flag" != "0" && "$publish_flag" != "1" ]]; then
  echo "参数应为 0 或 1" >&2
  exit 1
fi
published_val="true"
if [[ "$publish_flag" == "0" ]]; then
  published_val="false"
fi

# Read body from clipboard
body=$(pbpaste)
if [[ -z "${body}" ]]; then
  echo "剪贴板为空" >&2
  exit 1
fi

# First non-empty line
firstline=$(printf "%s\n" "$body" | awk 'NF{print; exit}')

# Extract first sentence from first line (Chinese/English punctuation)
title=$(perl -CS -Mutf8 -ne 'chomp; if($.==1){ if(/(.*?[。\.\!\?！？?])/){print $1} else {print substr($_,0,64)} }' <<< "$firstline")

# Trim spaces
title=$(echo "$title" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')

# Build filename slug (keep CJK, remove ASCII punct, spaces -> -)
slug=$(echo "$title" | tr '[:space:]' '-' | tr -d '[:punct:]')
if [[ -z "$slug" ]]; then
  slug=$(date "+%Y%m%d%H%M%S")
fi

fname="${slug}.md"
if [[ -e "${target_dir}/${fname}" ]]; then
  fname="${slug}-$(date "+%Y%m%d%H%M%S").md"
fi

date_str=$(date "+%Y-%m-%d %H:%M:%S")

cat > "${target_dir}/${fname}" <<EOF
---
title: $title
date: $date_str
published: $published_val
tags:
---

$body
EOF

echo "创建: ${target_dir}/${fname}"
