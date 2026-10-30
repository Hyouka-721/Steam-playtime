/* 第 80 轮 rebase 合并器：远端为基底（用户在网页端改了 10 条，含 5 条自填 tags）
   + 重放本地的「给 119 条补 tags」。
   规则：
   · 除 tags 以外的一切字段，**逐字沿用远端**（远端是用户在网页端的最新编辑；
     网页表单会重排本条目内的键顺序，这是正常的，不要"修正"）
   · 条目已有 tags（用户自己填的）→ 保留用户的内容，只做格式归一
     （拆「剧情，历史，战争」这种合串、去空、去重）
   · 条目没有 tags → 用本地映射补（先按 id 匹配，再按 title 兜底）
   用法：node tests/tools/merge80_rebase.mjs <本地带 tags 的 watch.json> [--write]
*/
import fs from 'fs';
import { execSync } from 'child_process';

const TARGET = 'docs/data/watch.json';
const src = process.argv[2];
const write = process.argv.includes('--write');
if (!src) { console.error('用法: node merge80_rebase.mjs <本地watch.json> [--write]'); process.exit(1); }

const remoteText = execSync('git show origin/main:' + TARGET, { encoding: 'utf8', maxBuffer: 1 << 28 });
const remote = JSON.parse(remoteText);
const mine = JSON.parse(fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, ''));

const SPLIT = /[,，、;；\/]+/;
function normTags(list) {
  const out = [];
  (Array.isArray(list) ? list : [list]).forEach((t) => {
    String(t == null ? '' : t).split(SPLIT).forEach((s) => {
      const v = s.trim();
      if (v && out.indexOf(v) < 0) out.push(v);
    });
  });
  return out;
}

const byId = new Map(mine.items.map((x) => [x.id, x]));
const byTitle = new Map(mine.items.map((x) => [x.title, x]));

let fromUser = 0, fromLocal = 0, missing = [];
const items = remote.items.map((it) => {
  let tags = null;
  if (Array.isArray(it.tags) && it.tags.length) {
    tags = normTags(it.tags);
    fromUser++;
  } else {
    const m = byId.get(it.id) || byTitle.get(it.title);
    if (m && Array.isArray(m.tags) && m.tags.length) { tags = m.tags.slice(); fromLocal++; }
    else missing.push(it.title);
  }

  // 重建条目：沿用远端键顺序，在没有 tags 时把 tags 插在 rating 之后
  const out = {};
  let placed = false;
  for (const k of Object.keys(it)) {
    if (k === 'tags') continue;
    out[k] = it[k];
    if (k === 'rating' && tags) { out.tags = tags; placed = true; }
  }
  if (tags && !placed) out.tags = tags;
  return out;
});

const merged = { updated_at: remote.updated_at, items };
const text = JSON.stringify(merged, null, 2) + '\n';

/* ---- 自检 ---- */
const errs = [];
if (merged.items.length !== remote.items.length) errs.push('条数变了');
remote.items.forEach((r, i) => {
  const m = merged.items[i];
  if (m.id !== r.id) errs.push('顺序/id 漂移 @' + i);
  const keys = new Set([...Object.keys(r), 'tags']);
  for (const k of keys) {
    if (k === 'tags') continue;
    if (JSON.stringify(r[k]) !== JSON.stringify(m[k])) errs.push(`字段 ${k} 被改动：${r.title}`);
  }
});
const noTags = merged.items.filter((x) => !Array.isArray(x.tags) || !x.tags.length);
if (noTags.length) errs.push('仍缺 tags：' + noTags.map((x) => x.title).join('、'));
merged.items.forEach((x) => {
  (x.tags || []).forEach((t) => { if (SPLIT.test(t)) errs.push('合串未拆：' + x.title + ':' + t); });
});
if (write && fs.existsSync(TARGET)) {
  const cur = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(cur) && !errs.length) { /* 冲突标记会被整体覆盖 */ }
}

const used = new Set();
merged.items.forEach((x) => (x.tags || []).forEach((t) => used.add(t)));
console.log(`条目 ${merged.items.length}｜tags 来自用户 ${fromUser} 条、来自本地映射 ${fromLocal} 条｜缺失 ${missing.length}`);
console.log(`词表 ${used.size} 个：${[...used].join('/')}`);
if (errs.length) { console.error('自检失败：\n  ' + errs.slice(0, 12).join('\n  ')); process.exit(1); }
console.log('自检通过：id/顺序与远端一致，除 tags 外所有字段逐字相同');
if (write) { fs.writeFileSync(TARGET, text); console.log('已写入 ' + TARGET); }
