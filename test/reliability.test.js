import assert from 'node:assert/strict';
import test from 'node:test';

import { html } from '../src/index.js';
import { content } from './helpers/content.js';
import { blogWith } from './perf/fixture.js';

const ctx = { timeZone: 'UTC', base: new URL('https://example.test') };
const source = { title: 'Raw', uri: 'drafts/raw', text: '' };

test('literal boundaries enforce source UTF-16 ceilings and do not parse pathological Markdown', async () => {
  const renderer = html();
  for (const [field, value] of [
    ['title', 'x'.repeat(501)],
    ['title', `${' '.repeat(500)}T`],
    ['text', 'x'.repeat(1048577)],
    ['preview', 'x'.repeat(5001)],
    ['text', {}],
    ['preview', 42],
    ['text', null]
  ]) {
    await assert.rejects(renderer.post({ ...source, [field]: value }, ctx), {
      code: 'YAMB_RENDERER_INPUT'
    });
  }

  const text = '['.repeat(1048576);
  const view = await renderer.post({ ...source, text, preview: '😀'.repeat(2500) }, ctx);
  assert.equal(view.body, text);
  assert.equal(view.preview, '😀'.repeat(2500));
});

test('invalid PostData metadata fails before preparation or related lookups', async () => {
  let calls = 0;
  const renderer = html({
    prepare() {
      calls++;
      return { title: 'T', text: { html: '' }, cover: {} };
    }
  });
  const yamb = {
    find() {
      calls++;
      return null;
    }
  };
  await using blog = await blogWith([], { renderers: { html: renderer } });
  const live = await blog.create({ title: 'Live' });

  for (const change of [
    { publishedAt: 'yesterday' },
    { publishedAt: null },
    { createdAt: { toString: () => '2026-11-10T09:00:00Z' } },
    { updatedAt: 0 },
    { links: { related: 'abc' } },
    { links: { related: Array.from({ length: 51 }, (_, i) => `id-${i}`) } },
    { author: { name: 'A', url: 'javascript:alert(1)' } },
    { social: { image: 'javascript:alert(1)' } },
    { status: 'public' },
    { tags: 'js' }
  ]) {
    const post = { ...source, ...change };

    await assert.rejects(renderer.post(post, { ...ctx, yamb }), { code: 'YAMB_RENDERER_INPUT' });
    await assert.rejects(blog.render('html', { post }), { code: 'YAMB_RENDERER_INPUT' });
  }

  await assert.rejects(renderer.post(live, { ...ctx, yamb }), { code: 'YAMB_RENDERER_INPUT' });
  assert.equal(calls, 0);
});

test('preparation rejects wrong representations and oversized derived fields without partial views', async () => {
  for (const prepared of [
    null,
    'html',
    { ...source, text: {} },
    { title: 'T', text: { html: 'x'.repeat(5000001) }, cover: {} },
    ...[
      'javascript:x',
      'data:image/svg+xml,<svg onload=alert(1)>',
      '//outside.test/a.jpg',
      '/\\outside.test/a.jpg',
      'java\tscript:x',
      'https://user:secret@example.test/a.jpg',
      'https://example.test/a b.jpg'
    ].map((url) => ({ title: 'T', text: { html: '' }, cover: { url } })),
    {
      title: 'T',
      text: { html: '' },
      cover: { url: `https://example.test/${'x'.repeat(5000000)}` }
    }
  ]) {
    await assert.rejects(html({ prepare: () => prepared }).post(source, ctx), {
      code: 'YAMB_RENDERER_INPUT'
    });
  }

  const failure = new Error('prepare unavailable');
  await assert.rejects(
    html({
      prepare() {
        throw failure;
      }
    }).post(source, ctx),
    (error) => error === failure
  );
});

test('abort after preparation preserves every native reason and prevents view publication', async (t) => {
  const prepare = content(t);
  for (const reason of [null, false, 0, '', NaN, Symbol('stop'), { why: 'left' }]) {
    const controller = new AbortController();
    const renderer = html({
      async prepare(snapshot, context) {
        const result = await prepare(snapshot, context);
        controller.abort(reason);
        return result;
      }
    });

    await assert.rejects(renderer.post(source, { ...ctx, signal: controller.signal }), (error) =>
      Object.is(error, reason)
    );
  }
});

test('standard preparation keeps nested content and removes executable HTML after all producers', async (t) => {
  const prepare = content(t);
  const text = `${'> '.repeat(30)}**CONTENT_RETAINED**\n\n<details><summary>Open</summary>Safe</details>\n\n<img src="./image.jpg" onerror="alert(1)"><script>alert(1)</script><iframe src="javascript:x"></iframe>`;
  const view = await html({ prepare }).post({ ...source, text, preview: text }, ctx);

  for (const value of [view.body, view.preview]) {
    assert.match(value, /<strong>CONTENT_RETAINED<\/strong>/);
    assert.match(value, /<details>/);
    assert.match(value, /src="https:\/\/example.test\/drafts\/image.jpg"/);
    assert.doesNotMatch(value, /<script|onerror|javascript:|<iframe/i);
  }
});
