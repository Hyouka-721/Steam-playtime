# -*- coding: utf-8 -*-
"""第 71 轮上线：把 watch.json 的本地改动重放到远端最新（d2d50ca）上
   需要重放的本地改动（全部幂等）：
   1) 太平年：观看 2026-02-14 / 上映只留 year 2026（无 release_date）/ id 同步
   2) 哈利·波特与魔法石：海报 → img/watch/harry-potter-and-the-sorcerer-s-stone-70ce4e93.webp，w/h 640×945
   3) 整表按 watched_at 倒排 + updated_at"""
import json, io, os, re, subprocess, datetime

REPO = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime'
OUT = REPO + '/docs/data/watch.json'

raw = subprocess.run(['git', '-C', REPO, 'show', 'origin/main:docs/data/watch.json'],
                     capture_output=True, check=True).stdout.decode('utf-8')
d = json.loads(raw)
items = d['items']
print('远端条目：', len(items))

# ---- 1) 太平年 ----
hit = [i for i, it in enumerate(items) if it['title'] == '太平年']
assert len(hit) == 1, hit
i = hit[0]
old = items[i]
new = {}
for k, v in old.items():
    if k == 'release_date':
        continue
    new[k] = v
new['watched_at'] = '2026-02-14'
new['id'] = '2026-02-14-swords-into-plowshares'
assert new['year'] == 2026 and 'release_date' not in new
items[i] = new

# ---- 2) 魔法石海报 ----
hit = [i for i, it in enumerate(items) if it['title'] == '哈利·波特与魔法石']
assert len(hit) == 1, hit
hp = items[hit[0]]
prev = hp['poster']
hp['poster'] = 'img/watch/harry-potter-and-the-sorcerer-s-stone-70ce4e93.webp'
hp['poster_w'] = 640
hp['poster_h'] = 945
assert os.path.exists(REPO + '/docs/' + hp['poster']), hp['poster']
print('魔法石海报：', prev, '→', hp['poster'])

# ---- 3) 排序 + 时间戳 ----
def sort_key(x):
    s = str(x.get('watched_at') or '').strip()
    m = re.match(r'^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$', s)
    return '0000-00-00' if not m else '%s-%s-%s' % (m.group(1), m.group(2) or '00', m.group(3) or '00')

items.sort(key=lambda x: (sort_key(x), str(x.get('id') or '')), reverse=True)
d['updated_at'] = datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

d2 = json.loads(io.open(OUT, encoding='utf-8').read())
tp = [x for x in d2['items'] if x['title'] == '太平年'][0]
hp2 = [x for x in d2['items'] if x['title'] == '哈利·波特与魔法石'][0]
from collections import Counter
print('合并后：', len(d2['items']), dict(Counter(x['kind'] for x in d2['items'])))
print('太平年：', tp['id'], tp['watched_at'], tp['year'], tp.get('release_date'))
print('魔法石：', hp2['poster'], hp2['poster_w'], 'x', hp2['poster_h'])
print('id 唯一：', len({x['id'] for x in d2['items']}) == len(d2['items']))
print('海报唯一：', len({x['poster'] for x in d2['items']}), '张 /', len(d2['items']), '条')
