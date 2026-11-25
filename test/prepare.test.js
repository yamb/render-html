import assert from 'node:assert/strict';
import test from 'node:test';

import { markdown } from 'yamb-markdown';
import { microtypo } from 'yamb-microtypo';
import { prepare } from 'yamb/transform';

import { html } from '../src/index.js';
import { content } from './helpers/content.js';

const ctx = { base: new URL('https://example.test/blog'), timeZone: 'UTC' };

function post(preview) {
  const source = {
    title: '"Заголовок" <b>😀</b>',
    uri: '2026/11/article',
    text: '"Введение"\n\n---\n\n# "Раздел"\n\nТекст **"статьи"**. `"raw" -- x`\n\n<img src="./photo.jpg" alt="raw -- alt" onerror="evil()"><script>evil()</script>',
    cover: { url: './cover--raw.jpg', alt: '"raw" -- alt', caption: '"Подпись"' },
    options: { text: '"raw" -- option' }
  };

  if (preview !== undefined) {
    source.preview = preview;
  }

  return source;
}

test('one prepared result supplies title, full body, separate preview, caption and reusable HAST', async (t) => {
  const prepareContent = content(t);
  const source = post('**"Анонс"**');
  const before = structuredClone(source);
  const prepared = await prepareContent(source, ctx);
  const renderer = html({ prepare: () => prepared });
  const view = await renderer.post(source, ctx);

  assert.equal(view.title, '«Заголовок» <b>😀</b>');
  assert.equal(view.cover.caption, '«Подпись»');
  assert.equal(view.cover.alt, '«raw»\u00a0— alt');
  assert.equal(view.cover.url, 'https://example.test/blog/2026/11/cover--raw.jpg');
  assert.match(view.body, /«Введение»/);
  assert.match(view.body, /<strong>«статьи»<\/strong>/);
  assert.match(view.body, /<code>"raw" -- x<\/code>/);
  assert.doesNotMatch(view.body, /Анонс|<script|onerror/);
  assert.match(view.preview, /<strong>«Анонс»<\/strong>/);
  assert.match(view.body, /<h1>«Раздел»<\/h1>/);
  assert.deepEqual(prepared.text.introduction.lines, [2, 3]);
  assert.equal(prepared.text.tree.children[prepared.text.introduction.index].tagName, 'hr');
  assert.doesNotMatch(view.body, /data-yamb-intro/);

  assert.deepEqual(view.options, source.options);
  assert.deepEqual(source, before);
  assert.deepEqual(prepared.source, before);
  assert.ok(Object.isFrozen(prepared.text.tree.children));
});

test('rendering keeps the preview and the full body independent', async (t) => {
  const prepareContent = content(t);

  for (const preview of [undefined, '', 'Анонс']) {
    const source = post(preview);
    const prepared = await prepareContent(source, ctx);
    const view = await html({ prepare: () => prepared }).post(source, ctx);

    assert.equal(Object.hasOwn(prepared, 'preview'), preview !== undefined);
    assert.equal(view.preview, preview ? '<p>Анонс</p>' : '');
    assert.match(view.body, /«Введение»/);
    assert.match(view.body, /статьи/);
  }
});

test('direct rendering captures every metadata field before callback or related-link awaits', async (t) => {
  const prepareContent = content(t);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const source = {
    ...post('Анонс'),
    tags: ['old'],
    links: { related: ['id'] },
    meta: { title: 'old' },
    social: { title: 'old' },
    author: { name: 'old' },
    slug: 'old',
    status: 'published',
    publishedAt: '2026-11-10T09:00:00Z',
    options: { version: 1 }
  };
  const before = structuredClone(source);
  const renderer = html({
    async prepare(snapshot, context) {
      entered.resolve();
      await release.promise;
      return prepareContent(snapshot, context);
    }
  });

  const rendering = renderer.post(source, {
    ...ctx,
    yamb: {
      async find(id) {
        assert.equal(id, 'id');
        return { status: 'published', uri: '2026/11/related' };
      }
    }
  });

  await entered.promise;

  source.title = 'new';
  source.text = 'new';
  source.preview = 'new';
  source.cover.caption = 'new';
  source.cover.url = '/new';
  source.tags.push('new');
  source.links.related.push('new');
  source.meta.title = 'new';
  source.options.version = 2;
  source.publishedAt = '2026-11-11T09:00:00Z';

  release.resolve();
  const view = await rendering;

  assert.equal(view.title, '«Заголовок» <b>😀</b>');
  assert.deepEqual(view.tags, before.tags);
  assert.deepEqual(view.meta, before.meta);
  assert.deepEqual(view.social, before.social);
  assert.deepEqual(view.author, before.author);
  assert.deepEqual(view.options, before.options);
  assert.equal(view.publishedAt, before.publishedAt);
  assert.deepEqual(view.links.related, ['2026/11/related']);
});

test('a callback editing its source copy leaves the view metadata unchanged', async () => {
  const source = {
    ...post(),
    slug: 'article',
    tags: ['old'],
    author: { name: 'old' },
    meta: { keywords: ['old'] },
    social: { title: 'old' },
    options: { nested: { list: ['old'] } }
  };
  const before = structuredClone(source);
  const view = await html({
    prepare(copy) {
      copy.slug = 'new';
      copy.tags.push('new');
      copy.author.name = 'new';
      copy.meta.keywords.push('new');
      copy.social.title = 'new';
      copy.options.nested.list.push('new');
      return { title: 'T', text: { html: '' }, cover: {} };
    }
  }).post(source, ctx);

  assert.equal(view.slug, before.slug);
  assert.deepEqual(view.tags, before.tags);
  assert.deepEqual(view.author, before.author);
  assert.deepEqual(view.meta, before.meta);
  assert.deepEqual(view.social, before.social);
  assert.deepEqual(view.options, before.options);
  assert.deepEqual(source, before);
});

test('derived title, alt, caption and resolved URLs use output budgets', async (t) => {
  const prepareContent = content(t);
  const source = {
    title: '12345 '.repeat(83).padEnd(500, 'x'),
    text: 'Text',
    uri: '2026/11/article',
    cover: {
      url: `./${'a'.repeat(4094)}`,
      alt: 'т.е. '.repeat(1000),
      caption: '12345 '.repeat(833).padEnd(5000, 'x')
    }
  };
  const prepared = await prepareContent(source, ctx);

  assert.ok(prepared.cover.url.length > 4096);
  assert.ok(prepared.title.length > 500);
  assert.ok(prepared.cover.caption.length > 5000);
  assert.equal(prepared.cover.alt, 'т.\u00a0е. '.repeat(1000).trim());

  const view = await html({ prepare: () => prepared }).post(source, ctx);
  assert.equal(view.cover.url, prepared.cover.url);
  assert.equal(view.cover.caption, prepared.cover.caption);
  assert.equal(view.cover.alt, prepared.cover.alt);

  const expanded = {
    ...prepared,
    title: 'expanded '.repeat(100),
    cover: { ...prepared.cover, caption: 'expanded '.repeat(1000) }
  };
  const other = await html({ prepare: () => expanded }).post(source, ctx);

  assert.equal(other.title, expanded.title);
  assert.equal(other.cover.caption, expanded.cover.caption);

  for (const change of [
    { title: 'x'.repeat(501) },
    { cover: { caption: 'x'.repeat(5001) } },
    { cover: { alt: 'x'.repeat(5001) } },
    { cover: { url: `./${'x'.repeat(4095)}` } }
  ]) {
    await assert.rejects(html({ prepare: () => expanded }).post({ ...source, ...change }, ctx), {
      code: 'YAMB_RENDERER_INPUT'
    });
  }
});

test('a custom prepare controls the representation without a hidden parser or typographer', async () => {
  let calls = 0;
  const renderer = html({
    prepare(source) {
      calls++;
      return {
        title: source.title,
        text: { html: '<article>chosen</article>' },
        cover: source.cover
      };
    }
  });
  const source = post();
  const view = await renderer.post(source, ctx);

  assert.equal(calls, 1);
  assert.equal(view.title, source.title);
  assert.equal(view.body, '<article>chosen</article>');
});

test('the final cleanup removes markup introduced by a custom stage after typography', async () => {
  await using md = markdown();
  await using typo = microtypo();
  const inject = {
    name: 'inject',
    version: '1',
    transform(value) {
      return {
        ...value,
        text: {
          ...value.text,
          html: `${
            value.text.html
          }<img src="javascript:evil()" onerror="evil()"><script>evil()</script>`
        }
      };
    }
  };

  const view = await html({
    prepare: (source, context) =>
      prepare(source, [md, md.html(), typo, inject, md.clean()], context)
  }).post(post(), ctx);

  assert.doesNotMatch(view.body, /javascript:|onerror|<script/i);
});
