# tests/tools — 常驻工具

只放**可以反复用**的脚本。一次性取证 / 补丁 / 合并脚本一律进 `archive/`。

| 脚本 | 用途 | 用法 |
|---|---|---|
| `perf-audit.mjs` | 首屏（FCP/LCP/TTFB/请求数/CLS）、卡片切换、滚动帧率一次跑完 | `node tests/tools/perf-audit.mjs <url> [标签]`，限速加 `THROTTLE=4g` |
| `perf-lazy.mjs` | 按需加载的耗时（成就卡、游戏库） | `node tests/tools/perf-lazy.mjs <url> [4g]` |
| `ab-css.mjs` | A/B 对照：两种 CSS 方案同机、固定限速各跑 N 次 | `node tests/tools/ab-css.mjs` |

三条性能红线的量化口径都在 `perf-audit.mjs` 的输出里：
二次访问 FCP ≤100ms、滚动 >50ms 的帧 = 0、CLS = 0.000。
**单次取样不算数** —— 线上 LCP 实测波动 1080~2872ms，必须 3 次取中位。

统一约定：Playwright 不在项目依赖里，脚本内用
`createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/')` 加载，启动参数带 `--no-proxy-server`。
