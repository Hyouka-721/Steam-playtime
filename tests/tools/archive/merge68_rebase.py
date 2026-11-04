# -*- coding: utf-8 -*-
"""第 67+68 轮上线：把 watch.json 的本地改动重放到远端最新数据上
   本地改动只有两条：
   1) 太平年：观看 2026-02-14 / 上映只有 year 2026（删 release_date）/ id 同步
   2) 整表按 watched_at 倒序（与网页加号同一套排序）"""
import json, io, re, subprocess, datetime, sys

REPO = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime'
OUT = REPO + '/docs/data/watch.json'

raw = subprocess.run(['git', '-C', REPO, 'show', 'origin/main:docs/data/watch.json'],
                     capture_output=True, check=True).stdout.decode('utf-8')
d = json.loads(raw)
items = d['items']
print('远端条目：', len(items))

hit = [i for i, it in enumerate(items) if it['title'] == '太平年']
assert len(hit) == 1, hit
i = hit[0]
old = items[i]
print('远端太平年：', old['id'], '| watched', old['watched_at'], '| year', old.get('year'),
      '| release_date', old.get('release_date'), '| rating', old.get('rating'))

new = {}
for k, v in old.items():
    if k == 'release_date':
        continue
    new[k] = v
new['watched_at'] = '2026-02-14'
new['id'] = '2026-02-14-swords-into-plowshares'
assert new['year'] == 2026 and new['rating'] == 8.5 and 'release_date' not in new
items[i] = new


def sort_key(x):
    s = str(x.get('watched_at') or '').strip()
    m = re.match(r'^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$', s)
    if not m:
        return '0000-00-00'
    return '%s-%s-%s' % (m.group(1), m.group(2) or '00', m.group(3) or '00')


items.sort(key=lambda x: (sort_key(x), str(x.get('id') or '')), reverse=True)
d['updated_at'] = datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

d2 = json.loads(io.open(OUT, encoding='utf-8').read())
from collections import Counter
tp = [x for x in d2['items'] if x['title'] == '太平年'][0]
print('合并后条目：', len(d2['items']), dict(Counter(x['kind'] for x in d2['items'])))
print('太平年：', tp['id'], tp['watched_at'], tp['year'], tp.get('release_date'), tp['rating'], tp['kind'])
print('最新 3 条：', [(x['title'], x['watched_at']) for x in d2['items'][:3]])
print('id 唯一：', len({x['id'] for x in d2['items']}) == len(d2['items']))
