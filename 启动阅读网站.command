#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if command -v node >/dev/null 2>&1; then
  node scripts/start.mjs
elif [[ -x /opt/homebrew/bin/node ]]; then
  /opt/homebrew/bin/node scripts/start.mjs
elif [[ -x /usr/local/bin/node ]]; then
  /usr/local/bin/node scripts/start.mjs
else
  print -u2 "请先安装 Node.js，并在项目中运行 npm ci。"
  exit 1
fi
if [[ $? -ne 0 ]]; then
  read "?启动失败，按回车关闭。"
fi
