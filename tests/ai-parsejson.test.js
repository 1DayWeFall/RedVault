'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseJson, estimateTokens } = require('../server/services/ai');

test('parseJson: 直接解析标准 JSON', () => {
  assert.deepStrictEqual(parseJson('{"a":1,"b":[2,3]}'), { a: 1, b: [2, 3] });
});

test('parseJson: 去 markdown 围栏', () => {
  assert.deepStrictEqual(parseJson('```json\n{"x":"y"}\n```'), { x: 'y' });
  assert.deepStrictEqual(parseJson('```\n{"x":"y"}\n```'), { x: 'y' });
});

test('parseJson: 提取首个平衡花括号块（前后有杂质文字）', () => {
  const dirty = '好的，整理结果如下：\n{"summary":"测试","key_points":["a","b"]}\n希望有帮助';
  assert.deepStrictEqual(parseJson(dirty), { summary: '测试', key_points: ['a', 'b'] });
});

test('parseJson: 嵌套花括号与字符串内花括号/引号转义', () => {
  const nested = '前缀 {"a":{"b":1},"c":"he said \\"hi\\" {x}"} 后缀';
  const r = parseJson(nested);
  assert.deepStrictEqual(r, { a: { b: 1 }, c: 'he said "hi" {x}' });
});

test('parseJson: 空/非字符串/无花括号返回 null', () => {
  assert.strictEqual(parseJson(''), null);
  assert.strictEqual(parseJson(null), null);
  assert.strictEqual(parseJson('没有 JSON 的内容'), null);
});

test('estimateTokens: 按 1.6 字符折算', () => {
  assert.strictEqual(estimateTokens(''), 0);
  assert.strictEqual(estimateTokens('0123456789abcdef'), 10); // 16 字符 / 1.6 = 10
});
