# 桌面便签 · Desktop Notes

> 一款轻量、优雅、高度融合桌面壁纸的便签应用，基于 Electron 构建，专为 Windows 11 64位设计。

![Platform](https://img.shields.io/badge/platform-Windows%2011-blue)
![Electron](https://img.shields.io/badge/electron-28-47848f?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 功能特性

### 📋 双模式便签
- **文本模式** — 自由书写，适合备忘录、想法记录、关键信息摘抄
- **列表模式** — 任务清单，逐条勾选完成，支持一键清除已完成项，带彩色进度条

### 🎨 美观易用
- 暗色玻璃拟态 UI，简洁现代
- 新建便签时可从 **8 种颜色**中自由选择标签颜色
- 透明度滑块（20%～100%），与桌面壁纸高度融合
- 支持**固定置顶**，始终悬浮于其他窗口之上

### 🗂️ 标签管理
- 左侧标签栏支持**拖拽排序**
- 列表便签在标签上直接显示进度条 + 完成比例
- 支持任意数量的便签，滚动查看

### ⚙️ 系统集成
- **开机自启动**（通过系统登录项注册，无需管理员权限）
- 自动记住窗口位置和大小，多显示器安全恢复
- 数据保存在安装目录的 `NotesData/notes.json`，**便于备份和迁移**

---

## 🚀 快速开始

### 直接安装
从 [Releases](../../releases) 页面下载最新的 `桌面便签 Setup x.x.x.exe`，双击安装即可。

### 从源码运行

```bash
# 克隆仓库
git clone https://github.com/your-username/desktop-notes.git
cd desktop-notes

# 安装依赖
npm install

# 开发模式启动
npm start
```

### 打包构建

```bash
# 生成 Windows 64位 NSIS 安装包（输出到 dist/ 目录）
npm run build
```

---

## 🎯 自定义图标

1. 准备一张 **256×256 像素**的 `.ico` 文件（推荐使用 [ICO Convert](https://icoconvert.com/) 在线转换）
2. 将文件命名为 `icon.ico`，放到项目 `assets/` 目录下
3. 重新执行 `npm run build` 即可打包进安装包

> 图标同时作用于：任务栏、桌面快捷方式、安装程序封面。

---

## 📁 项目结构

```
desktop-notes/
├── main.js          # Electron 主进程（窗口管理、IPC、数据读写）
├── preload.js       # 安全桥接层（contextBridge）
├── package.json     # 项目配置 + electron-builder 打包配置
├── src/
│   ├── index.html   # 应用 HTML 骨架
│   ├── styles.css   # 全局样式（玻璃拟态暗色主题）
│   └── renderer.js  # 渲染进程逻辑（状态管理 + UI 渲染 + 事件处理）
├── assets/
│   └── icon.ico     # 应用图标（需自行提供）
└── data/            # 开发时的数据目录（自动生成）
    └── notes.json
```

---

## 💾 数据格式

数据以 JSON 明文保存，结构清晰，便于迁移或手动编辑：

```json
{
  "version": "1.0.0",
  "notes": [
    {
      "id": "abc123",
      "title": "今日任务",
      "type": "list",
      "color": "#8b5cf6",
      "createdAt": 1704067200000,
      "updatedAt": 1704067200000,
      "content": {
        "text": "",
        "items": [
          { "id": "x1", "text": "完成需求文档", "completed": true,  "createdAt": 1704067200000 },
          { "id": "x2", "text": "代码 Review",  "completed": false, "createdAt": 1704067200000 }
        ]
      }
    }
  ],
  "settings": {
    "opacity": 0.93,
    "alwaysOnTop": true,
    "autoStart": false
  }
}
```

**生产环境数据路径：** `<安装目录>/NotesData/notes.json`

---

## 🛠️ 技术栈

| 技术 | 说明 |
|------|------|
| [Electron 28](https://electronjs.org/) | 跨平台桌面应用框架 |
| Vanilla JS | 无框架，零运行时依赖 |
| CSS 变量 + 玻璃拟态 | 现代暗色 UI 设计 |
| [electron-builder](https://www.electron.build/) | 打包为 NSIS 安装程序 |
| HTML5 Drag and Drop API | 标签拖拽排序 |

---

## 📝 开发计划

- [ ] 支持便签颜色的二次修改
- [ ] 富文本模式（Markdown 预览）
- [ ] 数据导出（TXT / Markdown）
- [ ] 多主题切换（浅色 / 深色 / 跟随系统）
- [ ] 便签内容搜索

欢迎 PR 和 Issue！

---

## 📄 License

[MIT](LICENSE) © 2024
