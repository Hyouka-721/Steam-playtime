/* 国别归一化：**唯一权威表**（第 95 轮）
 *
 * 为什么单独成库：国别有两个入口 —— 网页录入（`docs/watch.js`，经典脚本，没法 import ESM）
 * 和命令行（`scripts/watch/watch-add.mjs`）。两边各写一份就必然漂移，所以：
 *   · 网页端保留一份内联副本（浏览器拿不到 ESM）
 *   · 这里是指定权威值
 *   · `tests/unit/watch-country.test.mjs` 逐条比两边的表，漂了立刻红
 *
 * ⚠️ 港澳台一律收敛成「中国香港 / 中国澳门 / 中国台湾」，与站点口径一致。
 */

export const COUNTRY_ALIAS = {
  '中国': '中国', '中国大陆': '中国', '大陆': '中国', 'cn': '中国', 'china': '中国', 'prc': '中国',
  '中国香港': '中国香港', '香港': '中国香港', '港': '中国香港', 'hk': '中国香港', 'hongkong': '中国香港',
  '中国澳门': '中国澳门', '澳门': '中国澳门', '澳': '中国澳门', 'mo': '中国澳门', 'macau': '中国澳门', 'macao': '中国澳门',
  '中国台湾': '中国台湾', '台湾': '中国台湾', '台': '中国台湾', 'tw': '中国台湾', 'taiwan': '中国台湾',
  '美国': '美国', '美': '美国', 'us': '美国', 'usa': '美国', 'america': '美国', 'unitedstates': '美国',
  '日本': '日本', '日': '日本', 'jp': '日本', 'japan': '日本',
  '韩国': '韩国', '南韩': '韩国', '韩': '韩国', 'kr': '韩国', 'korea': '韩国', 'southkorea': '韩国',
  '英国': '英国', '英': '英国', 'uk': '英国', 'gb': '英国', 'britain': '英国', 'england': '英国',
  '法国': '法国', '法': '法国', 'fr': '法国', 'france': '法国',
  '德国': '德国', '德': '德国', 'de': '德国', 'germany': '德国',
  '意大利': '意大利', '意': '意大利', 'it': '意大利', 'italy': '意大利',
  '西班牙': '西班牙', '西': '西班牙', 'es': '西班牙', 'spain': '西班牙',
  '葡萄牙': '葡萄牙', 'pt': '葡萄牙', 'portugal': '葡萄牙',
  '加拿大': '加拿大', '加': '加拿大', 'ca': '加拿大', 'canada': '加拿大',
  '澳大利亚': '澳大利亚', '澳洲': '澳大利亚', 'au': '澳大利亚', 'australia': '澳大利亚',
  '新西兰': '新西兰', 'nz': '新西兰', 'newzealand': '新西兰',
  '俄罗斯': '俄罗斯', '俄国': '俄罗斯', '俄': '俄罗斯', 'ru': '俄罗斯', 'russia': '俄罗斯',
  '印度': '印度', '印': '印度', 'in': '印度', 'india': '印度',
  '泰国': '泰国', '泰': '泰国', 'th': '泰国', 'thailand': '泰国',
  '爱尔兰': '爱尔兰', 'ie': '爱尔兰', 'ireland': '爱尔兰',
  '瑞典': '瑞典', 'se': '瑞典', 'sweden': '瑞典',
  '丹麦': '丹麦', 'dk': '丹麦', 'denmark': '丹麦',
  '挪威': '挪威', 'no': '挪威', 'norway': '挪威',
  '芬兰': '芬兰', 'fi': '芬兰', 'finland': '芬兰',
  '荷兰': '荷兰', 'nl': '荷兰', 'netherlands': '荷兰',
  '比利时': '比利时', 'be': '比利时', 'belgium': '比利时',
  '瑞士': '瑞士', 'ch': '瑞士', 'switzerland': '瑞士',
  '奥地利': '奥地利', 'at': '奥地利', 'austria': '奥地利',
  '波兰': '波兰', 'pl': '波兰', 'poland': '波兰',
  '捷克': '捷克', 'cz': '捷克', 'czech': '捷克',
  '土耳其': '土耳其', 'tr': '土耳其', 'turkey': '土耳其',
  '巴西': '巴西', 'br': '巴西', 'brazil': '巴西',
  '墨西哥': '墨西哥', 'mx': '墨西哥', 'mexico': '墨西哥',
  '阿根廷': '阿根廷', 'ar': '阿根廷', 'argentina': '阿根廷',
  '南非': '南非', 'za': '南非', 'southafrica': '南非'
};

/** 单个国别归一化：去空白 → 查表；表里没有的原样保留（别把生僻国名吞掉） */
export function normCountry(s) {
  const raw = String(s == null ? '' : s).trim().replace(/\s+/g, '');
  if (!raw) return '';
  return COUNTRY_ALIAS[raw.toLowerCase()] || raw;
}

/** 一串国别拆开 + 归一化 + 去重（分隔符：中英文逗号 / 顿号 / 分号 / 斜杠 / 竖线 / 空白） */
export function parseCountries(s) {
  const raw = String(s == null ? '' : s).trim();
  if (!raw) return [];
  const out = [];
  const seen = new Set();
  raw.split(/[,，、;；/|\s]+/).forEach((part) => {
    const c = normCountry(part);
    if (c && !seen.has(c)) { seen.add(c); out.push(c); }
  });
  return out;
}
