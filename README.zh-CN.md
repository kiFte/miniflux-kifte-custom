# miniflux-kifte-custom

[English](README.md) | [简体中文](README.zh-CN.md)

[Miniflux](https://miniflux.app/) 的按用户 CSS/JS 定制 —— 外观主题 + 客户端 `/feeds` & `/unread` 分类分组。

## 为什么有这个仓库

Miniflux **没有全局 `CUSTOM_CSS` / `CUSTOM_JS` 环境变量**(已对照完整配置文档核实)。唯一的定制入口是**按用户的数据库列** `users.stylesheet` 和 `users.custom_js`,通过 API 写入:

```
PUT /v1/users/<id>   {"stylesheet": "..."}     # CSS 注入到 <head>
PUT /v1/users/<id>   {"custom_js": "..."}      # JS 注入为 <script type="module" nonce=...>
```

本仓库打包了我自己 Miniflux 实例上跑的两项定制,附一个可复用的注入脚本。不含任何凭据 —— 自备。

## 目录结构

```
themes/
  catppuccin-latte.css     Catppuccin Latte 主题(vendored 自 catppuccin/miniflux@main)
  grouping.css             客户端 /feeds & /unread 分组的 CSS(本仓库,MIT)
combined/
  latte+grouping.css       = catppuccin-latte.css + grouping.css,可直接注入
js/
  group_list.js            客户端脚本:/feeds 与 /unread 按分类分组,可折叠
apply/
  inject.sh                可复用的按用户注入脚本(curl + python3,无需 jq)
```

## 定制项

### 1. Catppuccin Latte 主题(浅色)

`themes/catppuccin-latte.css` 是 [catppuccin/miniflux](https://github.com/catppuccin/miniflux) `main` 分支 `themes/catppuccin-latte.css` 的逐字节 vendored 副本。功劳归 Catppuccin 项目(MIT)。它在内置 `light_serif` 基础主题之上覆盖 Miniflux 的 CSS 变量。

其他 Catppuccin 变体(Frappe、Macchiato、Mocha)上游也有 —— 想要更暗的配色换文件即可。

### 2. `/feeds` + `/unread` 分类分组(客户端 JS + CSS)

Miniflux 的 `/feeds`(订阅源列表)和 `/unread`(未读文章列表)页面**默认平铺**——分类只显示为每条目上的小标签,而非分节标题。这是已知的产品设计([miniflux discussion #1783](https://github.com/orgs/miniflux/discussions/1783),开了几年没动,无 env 可开关)。

`js/group_list.js` 是一段按用户的 `custom_js` 脚本,在客户端把两个列表页重建成可折叠、按分类分组的视图:

| 页面 | 行为 |
|---|---|
| `/feeds` | 醒目标题(`1.05rem`),每分类未读总数从 feed counter 提取 |
| `/unread` | 低调 uppercase 标题(`.75rem`,`meta` 色),每分类计数 = 本页文章数 |
| 两页通用 | 点标题(或聚焦时按 Enter/Space)折叠;状态存 `localStorage` |

实现要点:
- 文章节点是被**移动**(非克隆)进分类 `<section>` 的——form/button/swipe 事件与 `data-id` 全保留。
- 排序:按计数降序,其次按原出现顺序。
- CSP:Miniflux 设了 `require-trusted-types-for: 'script'`,所以脚本只用 DOM API(`createElement` / `appendChild` / `textContent` / `setAttribute` / `addEventListener`)—— **不用 `innerHTML`**。
- CSS 里的折叠箭头用了字面量 `▾`(U+25BE)字符——不要在 CSS `content` 里换成 `\u25BE`,不会渲染。

### 3. `/unread` 排序方向切换(客户端 JS,打包在 `group_list.js` 内)

Miniflux `/unread` 的服务端排序由 `user.EntryDirection` 控制(`asc` = 旧的在前,`desc` = 新的在前)。`/unread` 路由**没有 URL 查询参数覆盖**——官方开关只有按用户的设置下拉和 API。Miniflux 默认是 `asc`,所以未读堆起来最老的在最上,跟大多数人的直觉相反。

`group_list.js` 在 `/unread` 的 page-header nav 里加了个小箭头按钮(挨着"标记本页已读"/"全部标记已读"):

| 按钮 | 方向 | 含义 |
|---|---|---|
| `↓` | `desc`(首次访问默认) | 新→旧 |
| `↑` | `asc` | 旧→新 |

行为:

- 首次访问(无 localStorage)默认 `desc`——符合"新的在上"的直觉。
- 点击翻转方向,存入 `localStorage['miniflux:unread:sort-dir']`,并把当前页每个分类分组里的文章 DOM 节点原地重排。文章是移动而非克隆,所有 form/button/swipe 事件与 `data-id` 都保留。
- 排序键是每篇文章 `<time datetime="...">` 的 ISO 时间戳(来自 Miniflux 的 `item_meta.html` 模板)。稳定排序:时间相同维持原顺序。
- `/feeds` 不动——切换按钮只在 `/unread` 出现。
- CSP:同分组代码一样只用 DOM API,无 `innerHTML`。

**已知边界 —— 多页不一致。** 切换按钮只重排当前页已有的文章。若未读数超过 `EntriesPerPage`(默认 100),切到 `asc` 会让每一页内部旧→新,但不会跨整个未读集合重新分页。要让服务端分页也默认对齐 `desc`,跑一次:

```bash
./apply/inject.sh entry-direction desc
```

这会通过 `PUT /v1/users/<id>` 把 `entry_sorting_direction` 设为 `desc`,让服务端也默认新的在前。设好之后,多数情形(不点切换,或保持 `desc`)跨页一致;只有显式切到 `asc` 才会暴露这个边界。

## 前置条件

- 一个运行中的 Miniflux 实例(已在 `miniflux/miniflux:latest` 上测试)。
- 跑 `inject.sh` 的机器上有 `curl` 和 `python3`。
- 目标用户的 `id`(数字)。首个 admin 是 `1`;可用 `GET /v1/me`(Basic Auth)→ JSON 的 `id` 字段核实。
- 用户在 Miniflux UI 设置里的基础主题应为 `light_serif`(默认),Catppuccin Latte 配色才能正确叠加。

## 通过 AI agent 应用(推荐)

你不该自己手填环境变量、手跑 curl。把下面这段 prompt 丢给你的 AI 助手(Claude Code、Codex、Cursor、opencode 等)——它会读仓库、调 Miniflux API、把一切搞定。先把尖括号里四个值填了:

```
Deploy the Miniflux customizations from this repo to my Miniflux instance.

- Miniflux URL: <http://localhost:8080 或你的实例>
- Admin username: <you@example.com>
- Admin password: <你的密码>
- Target user ID: <1,或 "discover via GET /v1/me">

Read README.md and apply/inject.sh in this repo to understand the injection
flow, then run the three apply steps: stylesheet (combined/latte+grouping.css),
custom_js (js/group_list.js), and entry-direction desc. Report each PUT's HTTP
status and summarize what changed. Use inject.sh via bash + curl; fall back to
direct curl PUT against /v1/users/<id> only if inject.sh errors.
```

剩下的交给 agent。坚持手动的看下面。

## 手动应用(fallback)

```bash
export MF_URL=http://localhost:8080
export MF_USER=you@example.com
export MF_PASS=your_password
export MF_USER_ID=1

# 注入样式表(主题 + 分组 CSS 合并)
./apply/inject.sh css combined/latte+grouping.css

# 注入分组脚本
./apply/inject.sh js js/group_list.js
```

预期输出:`PUT .../v1/users/1 -> HTTP 201`。

打开 Miniflux,刷新 `/feeds` 和 `/unread`——分节应该出现,点一下折叠。

可选一次性:让服务端 `/unread` 排序与客户端切换默认值(新→旧)对齐:

```bash
./apply/inject.sh entry-direction desc
```

## 重置

```bash
./apply/inject.sh reset-css     # 恢复 Miniflux 默认样式
./apply/inject.sh reset-js      # 移除分组脚本
```

## 升级 / 维护

- **上游 Catppuccin 更新**:从 `catppuccin/miniflux@main` 重新拉 `themes/catppuccin-latte.css`,重建 `combined/`,重新注入。
- **Miniflux 版本升级**:若 `/feeds` 或 `/unread` 的 DOM 结构变了(class 名、counter 格式、`span.category` 位置),`group_list.js` 可能匹配失效。脚本目标选择器是 `article.feed-item` / `article.entry-item` 与 `span.category a`——到新模板里核对这两个选择器,必要时调整。改完重跑 `./apply/inject.sh js js/group_list.js`。
- **排序切换选择器**:`/unread` 切换按钮额外耦合 `time[datetime]`(来自 `common/item_meta.html`,用作排序键)与 `.page-header nav ul`(来自 `views/unread_entries.html`,按钮插入点)。任一模板改动,需相应更新 `js/group_list.js` 里的 `entryTime()` / `insertSortToggle()`。
- **新增 Miniflux 用户**:定制是按用户的——每个新用户 id 都要重跑两条 `inject.sh` 命令。

## 兼容性

截至 2026 年 7 月在 `miniflux/miniflux:latest` 上验证可用。定制依赖布局/DOM;未来 Miniflux 版本可能需要更新选择器。

## License

- `themes/catppuccin-latte.css` —— MIT,© Catppuccin organization(vendored 自 [catppuccin/miniflux](https://github.com/catppuccin/miniflux))。
- 本仓库其他一切 —— MIT,© kiFte。

见 `LICENSE`。
