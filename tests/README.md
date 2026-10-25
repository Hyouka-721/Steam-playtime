# 回归测试套件（tests/）

本目录收编了观影页（`watch.html`）从第 47 轮起逐步建立的**回归测试**与**上线复验**脚本，让它们随代码一起版本化，不再散落在临时目录里。

## 目录

```
tests/
├── verify/     # 本地回归套件（对 http://127.0.0.1:8895 跑）
├── online/     # 上线后对 https://hyouka-721.github.io/Steam-playtime/ 复验
└── tools/      # 辅助脚本（rebase 数据冲突合并器等）
```

## 运行前提

- Node 用托管运行时：`C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe`
- Playwright 装在 `C:/Users/33329/.workbuddy/binaries/node/workspace/`（脚本内 `createRequire` 指向它，ESM 不认 `NODE_PATH`）
- 本地站点服务：`docs/` 起静态服务在 `127.0.0.1:8895`
  ```
  cd docs && C:/Users/33329/.workbuddy/binaries/python/envs/default/Scripts/python.exe -m http.server 8895 --bind 127.0.0.1
  ```
- 跑单个套件：
  ```
  C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe tests/verify/verify70.mjs
  ```
- 跑全部 20 个套件（在 bash 里循环）：
  ```bash
  NODE="C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"
  for s in verify6 verify47 verify48 verify49 verify54 verify55 verify56 verify57 verify58 \
           verify60 verify62 verify63 verify64 verify65 verify66 verify67 verify68 verify69 verify70 verify72; do
    echo "== $s =="; "$NODE" tests/verify/$s.mjs 2>&1 | tail -2
  done
  ```

## 套件清单与当前基线（第 72 轮，共 825 条）

| 脚本 | 覆盖轮次 / 契约 | 条数 |
|---|---|---|
| `verify6` | 游戏站（index.html）首屏/请求/成就/快照（第 6 轮起） | 35 |
| `verify47` | 时间轴首次引入 + 视图切换 | 72 |
| `verify48` | 时间轴结构调整 | 78 |
| `verify49` | 成就按需加载 | 47 |
| `verify54` | 观影页入口（小黄人） | 23 |
| `verify55` | 小黄人放大 + 两页契约 | 40 |
| `verify56` | 史蒂夫接管视图切换 | 49 |
| `verify57` | 网页加号录入 | 40 |
| `verify58` | 标题与首页同字号（第 70 轮起只比字号/字距，不比行数） | 23 |
| `verify60` | 网格密度 1.5 倍 + 条目松绑 | 31 |
| `verify62` | 时间轴横向一行 + 字段顺序 | 61 |
| `verify63` | 垂直居中 | 35（数据相关浮动 33~35） |
| `verify64` | 时间轴文字统一 +4px | 40 |
| `verify65` | 超长英文名防溢出 | 16 |
| `verify66` | 六项界面修正（角标/评分小数/网格重排/分类/上映/标题） | 72 |
| `verify67` | 表格式列对齐（第 71 轮起中文名允许折 2 行） | 45 |
| `verify68` | 全站左轨统一 | 47 |
| `verify69` | 条目点击编辑（`page.route` 拦 api.github.com） | 32 |
| `verify70` | 换海报 + 站名（数据驱动：文件名 hash 反查） | 18 |
| `verify72` | 页眉 My Watch List / 排序切换 / 同日按上传时间 / 玉子修复 / 防撞车 | 21 |

`online/`：`online65/66/68/69/70/72.mjs` —— 上线后对 Pages 做内容指纹复验（判定线上/本地 md5 一致、功能生效），**线上验证写操作时要设计安全边界**（如 online69 故意在无 Token 的浏览器点保存，用 `page.on('request')` 数 PUT 必须为 0）。旧 online 脚本是一次性历史记录（online70 的海报 hash / 站名判据已被后续轮次改旧），复验当轮用最新那个。

`tools/merge*.py`：`watch.json` 在 rebase 时与远端冲突 → 用「远端为基底 + 重放本地改动」一键合并。⚠️ 第 72 轮起同日记录的 tie-break 从「id 倒序」改为「added_at 正序（先上传居前）」——合并器若按老规则重排，存储顺序会与渲染顺序不一致（页面加载时会用 cmpTime 重排兜底，不影响功能，但 diff 会难看）；要同步就照 `cmpTime` 抄。

## 关键约定（改代码/改回归前必读）

- **版本号 `?v=N` 是硬编码在多个脚本里的**，bump 必须同步。`watch.css?v=16` / `watch.js?v=9` 现在散落在 verify55/56/57/58/60/62/63/64/65/66/67/68/69/72 的断言里（有的脚本只有 css，有的两者都有）。
- **条数要从数据推导**（`N = data.items.length`），别写死 `22` / `26` / `39`。
- **快照/用户数据算出来的值（百分比、条数）期望都从数据里读**，别写死（`verify6` 的成就卡就是教训）。
- **判据分「契约」与「代理」**：`行数相同`、`页眉高相同` 是「两页文案相同」时的代理，文案一变就失效，要回到契约本身。
- **截图像素比对要「取稳定帧」**：字体 swap 会污染前几张，连续截到两次 md5 相同才采信。
- **截图前预热图片**：`.poster-pic img` 默认 `opacity:0`，靠 load 事件加 `is-loaded` 淡入；首屏外的图是 `loading="lazy"`，要先 `scrollIntoView` 再等 `complete && naturalWidth>0`。
- **本地服务 curl 加 `--noproxy '*'`**；本机 `hosts` 把 github 系列域名指向 127.0.0.1，线上探测一律用 Playwright（`--no-proxy-server`）+ 页内 `fetch(url,{cache:'reload'})`。
- 脚本里的绝对路径（`ROOT` / `OUT` / `createRequire`）是本机专用；换机器要改这几处。

## 关于旧脚本

第 1~46 轮的一堆一次性诊断脚本（`dbg*` / `diag*` / `measure*` / `cal*` / `ab*` 等）**没有**收进仓库——它们是一次性实验，无复用价值，仍留在本机临时目录与各轮归档 `Documents/Misc/对话成果/Steam游戏时长站/06_验证截图/` 里。需要考古时去归档目录按轮次找。
