'use strict';

/**
 * 相关笔记评分（DESIGN §5.7）
 * score = 3×|tags∩tags'| + 2×(subcategory 相同) + 1×(category 相同) + min(2, 标题 bigram 重合)
 * 取 score>0 的 Top 5，返回 note_id 数组；单向写入（只改新笔记）。
 */

/** 中文无分词：2 字符滑窗 */
function bigrams(s) {
  const set = new Set();
  const t = String(s || '').replace(/\s+/g, '');
  for (let i = 0; i + 2 <= t.length; i++) set.add(t.slice(i, i + 2));
  return set;
}

function score(target, other) {
  const a = new Set(target.tags || []);
  let tagHit = 0;
  for (const t of other.tags || []) if (a.has(t)) tagHit++;
  let s = 3 * tagHit;
  if (target.subcategory && target.subcategory === other.subcategory) s += 2;
  if (target.category && target.category === other.category) s += 1;
  const ga = bigrams(target.title), gb = bigrams(other.title);
  let bg = 0;
  for (const g of ga) if (gb.has(g)) bg++;
  s += Math.min(2, bg);
  return s;
}

/**
 * @param {object} target  新笔记（index 元数据形态）
 * @param {Array}  all     index 全部笔记（含 target 也会被排除）
 * @returns {string[]}     related note_id 列表（score>0，Top 5 降序）
 */
function relatedNotes(target, all) {
  return all
    .filter((n) => n.note_id !== target.note_id && n.type !== 'synthesis')
    .map((n) => ({ note_id: n.note_id, file: n.file, s: score(target, n) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map((x) => x.note_id);
}

module.exports = { relatedNotes, score, bigrams };
