#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""第 75 轮上线合并器：远端基底 + 重放本地改动（watch.json）

背景：本轮用户用网页加号又录了 4 部（罗小黑战记2 / 流浪地球2 / 冰雪奇缘2 / 蜘蛛侠：英雄远征），
远端 watch.json 从 102 条涨到 106 条；本地同一文件又多了 102 条的 poster_320 / poster_480 字段
（第 75 轮的响应式变体契约）→ rebase 必冲突。

合并规则：
  ① 远端为基底（用户新录的 4 条原样保留，字段/顺序/added_at 零改动）
  ② 只把本地「同一张海报」的 poster_320 / poster_480 两个字段搬过来（按 poster 文件名匹配）
  ③ 远端新录的 4 张海报没有变体 → 合并后由 scripts/watch-variants.mjs 补生成（不在本脚本里做）

守卫（任一不过即退出 1，不写文件）：
  - 条数 == 远端条数
  - 远端每条的用户字段零改动（逐字段比对）
  - id 唯一
  - 每条 poster / poster_320 / poster_480 指向的文件都存在（无死链）

用法：
  python merge75_rebase.py <remote_json> <local_json> <out_json> [--img-dir <目录>]
"""
import json
import os
import sys


def load(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def items_of(d):
    return d['items'] if isinstance(d, dict) else d


USER_FIELDS = ('id', 'title', 'title_en', 'kind', 'watched_at', 'year',
               'rating', 'note', 'added_at', 'poster', 'poster_w', 'poster_h')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    if len(args) < 3:
        print(__doc__)
        return 2
    remote_path, local_path, out_path = args[0], args[1], args[2]
    img_dir = None
    for i, f in enumerate(flags):
        if f == '--img-dir' and i + 1 < len(flags):
            img_dir = flags[i + 1]

    remote = load(remote_path)
    local = load(local_path)
    r_items = items_of(remote)
    l_items = items_of(local)

    # 本地：poster 文件名 → 变体字段
    l_map = {}
    for it in l_items:
        p = it.get('poster')
        if p:
            l_map[os.path.basename(p)] = (it.get('poster_320'), it.get('poster_480'))

    # 合并：远端基底 + 搬变体字段
    merged = 0
    out_items = []
    for it in r_items:
        base = os.path.basename(str(it.get('poster') or ''))
        v320, v480 = l_map.get(base, (None, None))
        new = dict(it)
        if v320 and not new.get('poster_320'):
            new['poster_320'] = v320
            merged += 1
        if v480 and not new.get('poster_480'):
            new['poster_480'] = v480
        out_items.append(new)

    # ---- 守卫 ----
    if len(out_items) != len(r_items):
        print('✗ 条数变了：%d → %d' % (len(r_items), len(out_items)))
        return 1
    for a, b in zip(r_items, out_items):
        for f in USER_FIELDS:
            if a.get(f) != b.get(f):
                print('✗ 用户字段被改动：%s.%s %r → %r' % (a.get('title'), f, a.get(f), b.get(f)))
                return 1
    ids = [x.get('id') for x in out_items]
    if len(ids) != len(set(ids)):
        print('✗ id 不唯一')
        return 1
    if img_dir:
        miss = []
        for x in out_items:
            for f in ('poster', 'poster_320', 'poster_480'):
                rel = x.get(f)
                if rel and not os.path.exists(os.path.join(img_dir, rel.replace('img/watch/', ''))):
                    miss.append(rel)
        if miss:
            print('✗ 死链 %d 个：%s' % (len(miss), miss[:5]))
            return 1

    # ---- 写回（保留远端的 6 空格缩进 + LF，字段插在 poster_h 之后）----
    raw = open(remote_path, 'r', encoding='utf-8', newline='').read()
    eol = '\r\n' if '\r\n' in raw else '\n'
    lines = raw.split(eol)
    out = []
    cur = None
    inserted = 0
    for line in lines:
        out.append(line)
        m = None
        import re
        m = re.match(r'^ {6}"poster": "(.+)",$', line)
        if m:
            cur = m.group(1)
            continue
        m = re.match(r'^ {6}"poster_h": (\d+),$', line)
        if m and cur:
            item = next((x for x in out_items if x.get('poster') == cur), None)
            if item:
                for w in (320, 480):
                    key = 'poster_%d' % w
                    if item.get(key):
                        out.append('      "%s": "%s",' % (key, item[key]))
                        inserted += 1
            cur = None
    text = eol.join(out)
    # 校验写出的 JSON 合法且条数不变
    back = json.loads(text)
    if len(items_of(back)) != len(out_items):
        print('✗ 写回后条数不符')
        return 1
    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('✓ 合并完成：%d 条（远端基底），搬入变体字段 %d 条 / 插入 %d 个字段'
          % (len(out_items), merged, inserted))
    novariant = [x.get('title') for x in out_items if not x.get('poster_320')]
    if novariant:
        print('  ⚠ 无 320 变体（需用 scripts/watch-variants.mjs 补生成）：%s' % '、'.join(novariant))
    return 0


if __name__ == '__main__':
    sys.exit(main())
