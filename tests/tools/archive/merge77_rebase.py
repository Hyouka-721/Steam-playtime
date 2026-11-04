#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""第 77 轮上线合并器：远端基底 + 重放《情书》换海报（watch.json）

背景：第 76 轮本地把《情书》海报从 love-letter-a5aa0f14（510×723）换成
love-letter-5b3706ed（640×914，含 320/480 变体）；同期远端被网页加号录了
7 部新片（113 条）→ rebase 时 watch.json 必冲突。

因为本轮本地对数据的改动**只有一个条目的 5 个海报字段**，所以不动远端
任何其它字节：只在远端文本里把该条目块的 poster / poster_w / poster_h /
poster_320 / poster_480 五行原地换值，其余行原样保留（字段顺序、缩进、
行尾、条目顺序全部沿用远端）。

守卫（任一不过即退出 1，不写文件）：
  - 条数 == 远端条数
  - 除《情书》外，每条用户字段逐字段与远端相同
  - 《情书》只有海报相关字段变化，其它字段（id/title/note/rating/added_at…）不变
  - id 唯一
  - 无重复键（同一 item 块里同名键只允许出现一次）
  - 每个 poster / poster_320 / poster_480 指向的文件都存在（无死链）
  - 写完能 JSON 解析回来且条数一致

用法：
  python merge77_rebase.py <remote_json> <local_json> <out_json> --img-dir <docs 目录>
"""
import json
import os
import re
import sys

TARGET_ID = '2021-08-02-love-letter'
POSTER_FIELDS = ('poster', 'poster_w', 'poster_h', 'poster_320', 'poster_480')
USER_FIELDS = ('id', 'title', 'title_en', 'kind', 'watched_at', 'year',
               'rating', 'note', 'added_at')


def load(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return json.load(f)


def items_of(d):
    return d['items'] if isinstance(d, dict) else d


def find(items, iid):
    for it in items:
        if it.get('id') == iid:
            return it
    return None


def check_dup_keys(text):
    """同一 item 块里不允许出现同名键（第 75 轮 watch-variants 写脏过）"""
    seen = {}
    cur = None
    dups = []
    for line in text.split('\n'):
        m = re.match(r'^ {4}"id": "([^"]+)",?$', line)
        if m:
            cur = m.group(1)
            seen[cur] = set()
            continue
        m = re.match(r'^ {6}"([A-Za-z_0-9]+)":', line)
        if m and cur:
            if m.group(1) in seen[cur]:
                dups.append('%s.%s' % (cur, m.group(1)))
            seen[cur].add(m.group(1))
    return dups


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = sys.argv[1:]
    if len(args) < 3:
        print(__doc__)
        return 2
    remote_path, local_path, out_path = args[0], args[1], args[2]
    img_dir = None
    if '--img-dir' in flags:
        img_dir = flags[flags.index('--img-dir') + 1]

    r_items = items_of(load(remote_path))
    l_items = items_of(load(local_path))
    r_love = find(r_items, TARGET_ID)
    l_love = find(l_items, TARGET_ID)
    if not r_love or not l_love:
        print('✗ 找不到 %s' % TARGET_ID)
        return 1

    # ---- 在远端文本里原地换值 ----
    with open(remote_path, 'r', encoding='utf-8', newline='') as f:
        text = f.read()
    eol = '\r\n' if '\r\n' in text else '\n'
    lines = text.split(eol)

    start = None
    for i, line in enumerate(lines):
        if re.match(r'^ {6}"id": "%s",?$' % re.escape(TARGET_ID), line):
            start = i
            break
    if start is None:
        print('✗ 远端文本里找不到 %s 的块' % TARGET_ID)
        return 1

    replaced = []
    end = None
    for i in range(start + 1, len(lines)):
        if re.match(r'^ {4}\},?$', lines[i]):
            end = i
            break
        m = re.match(r'^ {6}"([A-Za-z_0-9]+)":\s*(.+?)(,?)$', lines[i])
        if not m:
            continue
        key = m.group(1)
        if key not in POSTER_FIELDS:
            continue
        val = l_love[key]
        lit = '"%s"' % val if isinstance(val, str) else str(val)
        lines[i] = '      "%s": %s,' % (key, lit)
        replaced.append(key)
    if end is None:
        print('✗ %s 的块没有闭合' % TARGET_ID)
        return 1
    if sorted(replaced) != sorted(POSTER_FIELDS):
        print('✗ 海报字段没全替换，实际替换：%s' % replaced)
        return 1

    out_text = eol.join(lines)

    # ---- 守卫 ----
    merged = json.loads(out_text)
    m_items = items_of(merged)

    if len(m_items) != len(r_items):
        print('✗ 条数变了：%d → %d' % (len(r_items), len(m_items)))
        return 1

    for a, b in zip(r_items, m_items):
        if a.get('id') != b.get('id'):
            print('✗ 条目顺序被打乱：%s vs %s' % (a.get('id'), b.get('id')))
            return 1
        fields = USER_FIELDS + (() if a.get('id') == TARGET_ID else POSTER_FIELDS)
        for f in fields:
            if a.get(f) != b.get(f):
                print('✗ 用户字段被改动：%s.%s %r → %r'
                      % (a.get('id'), f, a.get(f), b.get(f)))
                return 1

    m_love = find(m_items, TARGET_ID)
    for f in POSTER_FIELDS:
        if m_love.get(f) != l_love.get(f):
            print('✗ 《情书》.%s 没换成：%r（应为 %r）' % (f, m_love.get(f), l_love.get(f)))
            return 1

    ids = [x.get('id') for x in m_items]
    if len(ids) != len(set(ids)):
        print('✗ id 不唯一')
        return 1

    dups = check_dup_keys(out_text)
    if dups:
        print('✗ 出现重复键 %d 个：%s' % (len(dups), dups[:5]))
        return 1

    if img_dir:
        miss = []
        for x in m_items:
            for f in POSTER_FIELDS:
                rel = x.get(f)
                if isinstance(rel, str) and rel.endswith('.webp'):
                    if not os.path.exists(os.path.join(img_dir, rel)):
                        miss.append(rel)
        if miss:
            print('✗ 死链 %d 个：%s' % (len(miss), miss[:5]))
            return 1

    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        f.write(out_text)

    print('✓ 合并完成：%d 条（远端基底），《情书》换海报 %s'
          % (len(m_items), '、'.join(replaced)))
    varies = [x.get('title') for x in m_items if not x.get('poster_320')]
    if varies:
        print('  ⚠ 无 320 变体（需跑 scripts/watch-variants.mjs）：%s' % '、'.join(varies))
    return 0


if __name__ == '__main__':
    sys.exit(main())
