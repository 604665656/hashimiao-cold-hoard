# 极寒末世囤货模拟器 · 哈士喵档案

单文件 HTML 生存经营模拟游戏，B站 TOY / GitHub Pages 上架工程仓。
成品就是根目录 `index.html`——一个 HTML 拷走就能玩，不联网、无依赖、无后端。

## 在线玩

- **GitHub Pages（已上线，现在可玩）**：https://604665656.github.io/hashimiao-cold-hoard/ （HTTP 200，返回内容与本仓 `index.html` 逐字节一致）
- **B站 TOY**：https://www.bilibili.com/toy/hashimiao-cold-hoard/index.html — id `54285236702208`，2026-11-12 提交，`auditing` 中，过审后开放
- **源码仓库**：https://github.com/604665656/hashimiao-cold-hoard （commit `d1b9c83`，31 文件）

## 玩法速览

- **核心循环**：-40℃ 极寒倒计时下，围绕资金、四档天气与 7 类物资做采购决策
- **结构**：3 幕推进，每 7 天一次营地会议，共 25 个事件
- **判定**：`resolveEnding(ctx)` 按「木桶短板」决定 11 种结局——任一物资缺口都会拖垮全局
- **系统**：门缝交易、最后窗口、采购预测、结算复盘、首局引导、断点续玩
- **可重复玩**：每日挑战 `HSMS1-`、结局图鉴、本机榜 / 好友榜、`HSM1-` 成绩码
- **分享**：750×1000 Canvas 成绩卡，可导出图片

## 技术规格（实测，非文档转述）

| 项 | 值 |
| --- | --- |
| 成品 | `极寒末世囤货模拟器_完整版.html` |
| 体积 | 612,236 B = 597.9 KiB（< 600 KiB 硬闸门） |
| SHA256 | `defa258d117462ede08fd7752318bd413bbef3dc77f0a02fb11a448b77f6dee2` |
| 构建号 | `1.0.0+20261112` |
| 内联 script / style | 1 / 1 |
| 外部 script / stylesheet / http(s) 资源 | 0 / 0 / 0 |
| `fetch(` / `XMLHttpRequest` | 0 / 0 |
| 内嵌图片 | 37 张（全部 data URI） |
| `localStorage` | 3 处 |
| `node --check` | 1/1 PASS |
| `tools/verify.py` | 19/19 PASS |

复核口径：入口 SHA256 同时命中交付包 `发布清单.json` 的 `entry_sha256` 与 `SHA256SUMS`。
交付包自报 12 项硬检查 PASS、7 阶段回归 0 pageerror（来源：`发布清单.json` / `发布验收日志.txt`，本仓未重跑浏览器回归）。

## 合规与边界

- **零外部请求**：不联网、无外链、无后端、无 CDN；所有数据只存本机 `localStorage`
- **素材**：37 张均来自哈士喵自有素材体系（透明角色 6 / 三幕幕间 3 / 事件卡 9 / 物资卡 7 / 结局插画 11 / 主页 Hero 1），解码合计 380.3 KiB、内嵌 508.0 KiB
- **版权**：美术资产仅授权在《极寒末世囤货模拟器》本项目内使用；玩家导出的成绩卡属于游玩成果可自行分享，但不得把其中角色 / 场景图层剥离单独使用
- Toy 入口 < 1 MiB，**单文件直传、未分包、未改动用户成品一个字节**

## 目录

```
index.html              GitHub Pages 可玩入口（与 Toy 入口逐字节一致）
.nojekyll
toy/index.html          B站 TOY 上传入口
toy/build_meta.json     构建元信息
icon.png / poster.png   上架图标 / 1200×675 封面（素材取自交付包 上架预览.png）
tools/verify.py         19 项静态校验
交付包/                 用户原始交付包完整解包（cp437 中文名已恢复）
```

## 复现

```bash
python _prepare_new_games.py     # 工作区根目录：解包 + 校验 + 生成 Toy/Pages 入口
python _make_assets_new.py       # 用官方预览图生成封面 / 图标
python tools/verify.py           # 19 项断言
python tools/verify.py toy/index.html
```
