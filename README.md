# Bilingual Paper Reader

**面向论文精读的本地中英文对照阅读器 · MIT 开源**

A local bilingual paper reader with aligned paragraphs, source references, equations, figures, and persistent annotations.

[项目介绍](https://github.com/by-lastime/bilingual-paper-reader-showcase) · [MIT 许可证](LICENSE) · [科研学习工作流](https://github.com/by-lastime/research-learning-workflow)

## 功能

- 稳定段落编号连接中英文，支持双栏同步与单栏阅读。
- 论文库、章节目录、深浅色与阅读位置记忆。
- 公式渲染、图表放大与原 PDF 页定位。
- 文件中的问答批注，支持追问补充和内容更新。
- 内容校验失败时保留上一份可读版本，并保存本地历史快照。

## 开始使用

需要 Node.js 与 npm。先克隆仓库并运行 `npm ci`，再接入自己的阅读材料：

| 文件/目录 | 用途 |
|---|---|
| `content/library.json` | 论文列表、默认论文、内容与资源目录 |
| `content/english.blocks.json` | 稳定段落编号、类型、PDF 页码 |
| `content/source.json` | 论文来源、版本、原 PDF 路径及校验和 |
| `content/paper.en.md` | 带 block 编号的英文正文 |
| `content/paper.zh.md` | 使用相同编号的中文正文与批注 |
| 论文对应 assets 目录 | 正文引用的图表 |

正文与批注格式见 [AGENTS.md](AGENTS.md)。源码快照没有包含完整论文或个人批注，所以仅安装依赖还不能打开完整阅读内容。

材料齐备后执行：

```sh
npm run check
npm start
```

默认地址为 `http://127.0.0.1:4173`，服务只绑定本机。macOS 可以双击启动脚本；其他系统可通过 npm 启动，并自行用浏览器打开。避免与现有本地阅读器争用端口。

## 实现结构

`server.mjs` 负责读取、解析与监听文件；`dist/` 在当前工程中保存浏览器程序文件；`scripts/` 包含材料提取与检查工具。Markdown 由 markdown-it 解析，公式由 KaTeX 渲染。

`scripts/extract_source.py` 和 `scripts/check-live.mjs` 保留原 Attention 项目的提取/集成核验流程，依赖指定论文版本、目录和材料，不是任意论文的通用转换器。使用前需按自己的目录调整和准备对应材料。

## 边界

网站管理已准备好的双语正文，不自动翻译任意 PDF，也不内置模型调用。问答由用户已有 AI 工具承担；直接写回需要本地文件权限。当前没有部署公开在线阅读服务。

原论文、译文、图表和私人问答不随源码发布。`SOURCE_SNAPSHOT.json` 记录代码快照及公开整理变更。本轮核验语法与发布范围，未使用私人论文重新执行完整应用测试。

## 许可

原创程序与文档使用 [MIT](LICENSE)。markdown-it、KaTeX 及其他依赖保留各自许可证；自行接入的论文、图片、译文等材料不属于本仓库授予许可的范围。
