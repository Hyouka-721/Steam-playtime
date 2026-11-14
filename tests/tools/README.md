# tests/tools — 常驻工具

只放**可以反复用**的脚本。一次性取证 / 补丁 / 版本号 bump 脚本**随做随删**（git 历史即归档）。

| 脚本 | 用途 | 用法 |
|---|---|---|
| `perf-audit.mjs` | 首屏（FCP/LCP/TTFB/请求数/CLS）、卡片切换、滚动帧率一次跑完 | `node tests/tools/perf-audit.mjs <url> [标签]`，限速加 `THROTTLE=4g` |
| `perf-lazy.mjs` | 按需加载的耗时（成就卡、游戏库） | `node tests/tools/perf-lazy.mjs <url> [4g]` |
| `ab-css.mjs` | A/B 对照：两种 CSS 方案同机、固定限速各跑 N 次 | `node tests/tools/ab-css.mjs` |
| `pages-poll.mjs` | 推送后轮询 Pages 是否生效（css + app 两件字节 md5 + 新函数名） | `node tests/tools/pages-poll.mjs` |
| `probes/rowfit-geo.mjs` | 扫多个视口高度，看榜单「完整行 / 被切开的行」 | `node tests/tools/probes/rowfit-geo.mjs` |
| `probes/rowfit-matrix.mjs` | 宽 × 高矩阵（1088~1920 × 800~1080）同上 + CLS | `node tests/tools/probes/rowfit-matrix.mjs` |
| `probes/pixel-scan.mjs` | 从截图反解某个区域的行/列间距（对付「看着间距不对」） | `node tests/tools/probes/pixel-scan.mjs <png> <y0> <y1> <x0> <x1>` |
| `probes/scroll-jump.mjs` | 复现「点击后页面跳动」并打印 scrollY 前后值 | `node tests/tools/probes/scroll-jump.mjs <宽> <高>` |

三条性能红线的量化口径都在 `perf-audit.mjs` 的输出里：
二次访问 FCP ≤100ms、滚动 >50ms 的帧 = 0、CLS = 0.000。
**单次取样不算数** —— 线上 LCP 实测波动 1080~2872ms，必须 3 次取中位。

统一约定：Playwright 不在项目依赖里，脚本内用
`createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/')` 加载，启动参数带 `--no-proxy-server`。
