# -*- coding: utf-8 -*-
"""第 66 轮上线前预演：把本地改动重放到远端最新 watch.json 上，供 verify66 预演。
   输出到临时目录，不动仓库文件。"""
import json, io, os, datetime, shutil

SRC = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs'
REMOTE = 'C:/Users/33329/AppData/Local/Temp/remote-watch.json'
WORK = 'C:/Users/33329/AppData/Local/Temp/steam66rebase/docs'

d = json.load(io.open(REMOTE, encoding='utf-8'))
items = d['items']
print('远端条目：', len(items))

# --- 重放第 66 轮的改动 ---
hit = [i for i, it in enumerate(items) if it['title'] == '太平年']
assert len(hit) == 1, hit
i = hit[0]
new = {}
for k, v in items[i].items():
    new[k] = v
    if k == 'year':
        new['release_date'] = '2026-02-14'
        new['rating'] = 8.5
assert new['release_date'] == '2026-02-14' and new['rating'] == 8.5
items[i] = new

for t in ['士兵突击', '赛博朋克：边缘行者', '英雄联盟：双城之战']:
    h = [i for i, it in enumerate(items) if it['title'] == t]
    assert len(h) == 1, (t, h)
    items[h[0]]['kind'] = 'series'

d['updated_at'] = datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()

# --- 组装预演目录 ---
if os.path.isdir(os.path.dirname(WORK)):
    shutil.rmtree(os.path.dirname(WORK))
shutil.copytree(SRC, WORK)
io.open(os.path.join(WORK, 'data', 'watch.json'), 'w', encoding='utf-8', newline='\n').write(
    json.dumps(d, ensure_ascii=False, indent=2) + '\n')

from collections import Counter
print('合并后条目：', len(d['items']), dict(Counter(it['kind'] for it in d['items'])))
print('新条目：', [it['title'] for it in d['items'] if it['title'] in ('奥本海默', '紫罗兰永恒花园 剧场版', '周处除三害')])
print('预演目录：', WORK)
