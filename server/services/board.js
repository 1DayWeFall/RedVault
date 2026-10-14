'use strict';

/**
 * Read-only knowledge map for the board view.
 * The index is the source for note metadata; inbox is only used for status counts.
 * No vault writes or content reads happen here.
 */

function key(prefix, value) {
  return `${prefix}:${encodeURIComponent(String(value || '未分类'))}`;
}

function addNode(nodes, seen, node) {
  if (seen.has(node.id)) return;
  seen.add(node.id);
  nodes.push(node);
}

function createBoard({ index = { notes: [] }, inbox = [] } = {}) {
  const notes = Array.isArray(index.notes) ? index.notes : [];
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const edgeSeen = new Set();

  const addEdge = (from, to) => {
    const id = `${from}->${to}`;
    if (edgeSeen.has(id)) return;
    edgeSeen.add(id);
    edges.push({ id, from, to });
  };

  for (const note of notes) {
    const category = String(note.category || '未分类').trim() || '未分类';
    const subcategory = String(note.subcategory || '').trim();
    const domainId = key('domain', category);
    addNode(nodes, seen, { id: domainId, type: 'domain', label: category, count: 0 });

    let parentId = domainId;
    if (subcategory) {
      const subId = key('subcategory', `${category}/${subcategory}`);
      addNode(nodes, seen, { id: subId, type: 'subcategory', label: subcategory, category, count: 0 });
      addEdge(domainId, subId);
      parentId = subId;
    }

    const noteId = `note:${encodeURIComponent(String(note.note_id || note.file || note.title || nodes.length))}`;
    const quality = note.quality_status || (note.category === '未整理' ? 'unprocessed' : 'ready');
    addNode(nodes, seen, {
      id: noteId,
      type: 'note',
      note_id: note.note_id,
      label: String(note.title || '未命名'),
      category,
      subcategory,
      tags: Array.isArray(note.tags) ? note.tags : [],
      quality,
      note_type: note.type || 'normal',
      file: note.file || ''
    });
    addEdge(parentId, noteId);
  }

  const counts = new Map();
  for (const node of nodes) {
    if (node.type === 'domain' || node.type === 'subcategory') counts.set(node.id, 0);
  }
  for (const edge of edges) {
    if (counts.has(edge.from)) counts.set(edge.from, counts.get(edge.from) + 1);
  }
  for (const node of nodes) {
    if (counts.has(node.id)) node.count = counts.get(node.id);
  }

  const pending = inbox.filter((x) => x.status === 'pending').length;
  const processing = inbox.filter((x) => x.status === 'processing').length;
  const failed = inbox.filter((x) => x.status === 'failed').length;
  return {
    nodes,
    edges,
    stats: {
      notes: notes.length,
      domains: nodes.filter((n) => n.type === 'domain').length,
      categories: nodes.filter((n) => n.type === 'subcategory').length,
      pending,
      processing,
      failed,
      totalInbox: inbox.length
    }
  };
}

function readBoard(ctx) {
  return createBoard({ index: ctx.store.readIndex(), inbox: ctx.store.readInbox() });
}

module.exports = { createBoard, readBoard };
