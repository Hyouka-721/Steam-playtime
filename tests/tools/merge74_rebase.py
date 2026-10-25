# -*- coding: utf-8 -*-
"""第 74 轮上线：把 watch.json 的本地改动重放到远端最新（635e4c4，含用户新录《肖申克的救赎》
   与《小森林》评分编辑）上。远端为基底，本地改动全部重放（幂等，可反复跑）。

需要重放的本地改动：
   1) 34 部日本动画剧集 kind → anime（番剧，用户确认范围）
   2) 顺带修两处客观错分：半泽直树（TBS 日剧）、洛基（Disney+ 剧集）movie → series
   3) 《她和她的猫》：kind → anime + 海报换 item-b73c9fed.webp（537×800）
   4) 审查订正：某科学的超电磁炮 year 20009→2009；中二病也要谈恋爱！year 2010→2012；
      末代皇帝 kind series→movie

用户数据保护：不动任何 added_at / rating / note / watched_at；远端 102 条一条不删。
"""
import json, io, subprocess, datetime, os, sys
from collections import Counter

REPO = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime'
OUT = REPO + '/docs/data/watch.json'

raw = subprocess.run(['git', '-C', REPO, 'show', 'origin/main:docs/data/watch.json'],
                     capture_output=True, check=True).stdout.decode('utf-8')
d = json.loads(raw)
items = d['items']
remote_n = len(items)
remote_ids = {x['id'] for x in items}
print('远端条目：', remote_n, dict(Counter(x.get('kind', 'movie') for x in items)))

ANIME = ["赛博朋克：边缘行者", "游戏人生", "新世纪福音战士", "鬼灭之刃：游郭篇", "奇巧出租车",
         "Re：从零开始的异世界生活", "重启咲良田", "冰海战记", "在魔王城说晚安", "多罗罗",
         "总之就是非常可爱", "工作细胞BLACK", "咒术回战", "玉子市场", "工作细胞2", "魔女之旅",
         "小林家的龙女仆", "末日三问", "境界的彼方", "在下坂本，有何贵干？", "轻音少女",
         "神之塔", "某科学的超电磁炮T", "异度侵入", "埃罗芒阿老师", "欢迎来到实力至上主义教室",
         "她和她的猫", "工作细胞", "中二病也要谈恋爱！", "辉夜大小姐想让我告白",
         "徒然喜欢你", "青春猪头少年不会梦到兔女郎学姐", "冰菓", "某科学的超电磁炮"]

def one(pred, what):
    hit = [i for i, it in enumerate(items) if pred(it)]
    assert len(hit) == 1, '%s 命中 %d 条: %r' % (what, len(hit), [items[i]['title'] for i in hit])
    return hit[0]

def by_title(t):
    return one(lambda it: it['title'] == t, '片名「%s」' % t)

# ---- 1) 番剧重分类（含《她和她的猫》）----
n_anime = 0
for t in ANIME:
    it = items[by_title(t)]
    if it.get('kind') != 'anime':
        it['kind'] = 'anime'
        n_anime += 1
print('番剧重分类：%d 条改为 anime（原本已是的不重复计数）' % n_anime)

# ---- 2) 两处客观错分 movie → series ----
for t in ('半泽直树', '洛基'):
    it = items[by_title(t)]
    assert it.get('kind', 'movie') == 'movie', t + ' 已是 ' + it.get('kind')
    it['kind'] = 'series'
    print('错分修正：%s → series' % t)

# ---- 3) 《她和她的猫》换海报 ----
cat = items[by_title('她和她的猫')]
cat['poster'] = 'img/watch/item-b73c9fed.webp'
cat['poster_w'] = 537
cat['poster_h'] = 800
assert os.path.exists(REPO + '/docs/' + cat['poster']), cat['poster']
print('她和她的猫海报 →', cat['poster'], cat['poster_w'], 'x', cat['poster_h'])

# ---- 4) 审查订正三处 ----
railgun = items[one(lambda it: it['id'] == '2020-01-21-item', 'id 2020-01-21-item')]
assert railgun['year'] in (2009, 20009), railgun['year']
railgun['year'] = 2009
chuni = items[one(lambda it: it['id'] == '2020-07-16-item', 'id 2020-07-16-item')]
assert chuni['year'] in (2012, 2010), chuni['year']
chuni['year'] = 2012
last = items[one(lambda it: it['id'] == '2020-08-31-the-last-emperor', 'id 末代皇帝')]
assert last['kind'] in ('movie', 'series'), last['kind']
last['kind'] = 'movie'
print('审查订正：超电磁炮 year=%d / 中二病 year=%d / 末代皇帝 kind=%s'
      % (railgun['year'], chuni['year'], last['kind']))

# ---- 5) updated_at 刷新 ----
d['updated_at'] = datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# ---- 6) 合并后校验 ----
d2 = json.loads(io.open(OUT, encoding='utf-8').read())
its = d2['items']
assert len(its) == remote_n, '条数变了 %d → %d' % (remote_n, len(its))
assert {x['id'] for x in its} == remote_ids, 'id 集合变了'
assert len({x['id'] for x in its}) == len(its), 'id 不唯一'
# 用户新录/编辑的条目零改动（除本地明确要改的字段外）
old = {x['id']: x for x in json.loads(raw)['items']}
for x in its:
    o = old[x['id']]
    for k in ('added_at', 'watched_at', 'rating', 'note', 'title', 'title_en', 'poster_w', 'poster_h'):
        if x['id'] in ('2020-07-17-item',):
            if k == 'poster_w' or k == 'poster_h':
                continue
        assert x.get(k) == o.get(k), '用户字段被改：%s %s %r → %r' % (x['id'], k, o.get(k), x.get(k))
print('用户字段零改动（added_at/watched_at/rating/note/title/title_en）')
shaw = [x for x in its if x['title'] == '肖申克的救赎']
assert len(shaw) == 1 and shaw[0]['rating'] == 9, '肖申克异常'
print('《肖申克的救赎》保留：rating', shaw[0]['rating'], '/', shaw[0]['added_at'])
print('合并后：', len(its), dict(Counter(x.get('kind', 'movie') for x in its)))
print('updated_at:', d['updated_at'])
