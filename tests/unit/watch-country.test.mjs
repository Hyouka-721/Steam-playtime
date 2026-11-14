/* 第 95 轮：国别归一化「网页内联副本 ↔ CLI 权威表」一致性守卫
 *
 * 浏览器用经典脚本，没法 import ESM，所以 `docs/watch.js` 里必然有一份内联的
 * COUNTRY_ALIAS。两边一旦漂移，同一个「US」在网页填成「美国」、在命令行写成「US」，
 * 数据就脏了 —— 这里逐条比。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COUNTRY_ALIAS, normCountry, parseCountries } from '../../scripts/watch/country-lib.mjs';

const DOCS = new URL('../../docs/', import.meta.url);
const js = fs.readFileSync(new URL('watch.js', DOCS), 'utf8');

/** 从 docs/watch.js 里把内联别名表抽出来 */
function inlineAlias() {
  const block = /var COUNTRY_ALIAS = \{([\s\S]*?)\n  \};/.exec(js);
  assert.ok(block, 'docs/watch.js 里没找到 COUNTRY_ALIAS');
  const out = {};
  const re = /'([^']+)':\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block[1]))) out[m[1]] = m[2];
  return out;
}

test('网页内联别名表与 country-lib 逐条一致（键集合与映射值都相同）', () => {
  const inline = inlineAlias();
  const a = Object.keys(inline).sort();
  const b = Object.keys(COUNTRY_ALIAS).sort();
  assert.deepEqual(a, b, '键集合不一致：只在一侧存在的别名 = ' +
    JSON.stringify({ onlyInline: a.filter((k) => !b.includes(k)), onlyLib: b.filter((k) => !a.includes(k)) }));
  for (const k of a) {
    assert.equal(inline[k], COUNTRY_ALIAS[k], `别名「${k}」映射不一致：网页=${inline[k]} lib=${COUNTRY_ALIAS[k]}`);
  }
});

test('归一化：常见写法收敛到规范名', () => {
  assert.equal(normCountry('美'), '美国');
  assert.equal(normCountry('US'), '美国');
  assert.equal(normCountry(' usa '), '美国');
  assert.equal(normCountry('UnitedStates'), '美国');
  assert.equal(normCountry('香港'), '中国香港');
  assert.equal(normCountry('澳门'), '中国澳门');
  // 第 98 轮改口径：大陆与台湾并进「中国」（用户：「中国大陆与中国台湾 合并成中国」）。
  // 第 96 轮曾把主陆规范名定成「中国大陆」（避免与港澳台并列时歧义），本轮按用户要求收回。
  assert.equal(normCountry('台湾'), '中国');
  assert.equal(normCountry('中国台湾'), '中国');
  assert.equal(normCountry('中国'), '中国');
  assert.equal(normCountry('中国大陆'), '中国');
  assert.equal(normCountry('大陆'), '中国');
  assert.equal(normCountry('China'), '中国');
  assert.equal(normCountry('日本'), '日本');
  assert.equal(normCountry(''), '');
});

test('表里没有的国名原样保留，不会被吞掉', () => {
  assert.equal(normCountry('冰岛'), '冰岛');
  assert.equal(normCountry('Iceland'), 'Iceland');
});

test('parseCountries：多种分隔符、去重、保序', () => {
  assert.deepEqual(parseCountries('美国, 英国'), ['美国', '英国']);
  assert.deepEqual(parseCountries('美、USA、美国'), ['美国'], '三种写法应去重成一个');
  assert.deepEqual(parseCountries('日本 / 中国香港'), ['日本', '中国香港']);
  assert.deepEqual(parseCountries('   '), []);
  assert.deepEqual(parseCountries('美国，英国；法国'), ['美国', '英国', '法国']);
});

test('网页端 readCountryField 用的分隔符与 lib 一致', () => {
  const m = /raw\.split\(\/(\[[^\]]*\]\+)\/\)/.exec(js);
  assert.ok(m, 'docs/watch.js 里没找到 readCountryField 的 split 正则');
  assert.equal(m[1], '[,，、;；\\/|\\s]+', '分隔符集合必须与 country-lib 的 parseCountries 一致');
});
