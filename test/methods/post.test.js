import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';

import { markdown } from '@meritt/yamb-markdown';
import { Post } from 'yamb';
import { prepare } from 'yamb/transform';

import { html } from '../../src/index.js';
import { buildView } from '../../src/views/post.js';
import { blogWith } from '../perf/fixture.js';

const CLOCK = () => Temporal.Instant.from('2026-04-26T12:00:00Z');

function makeBlog({ rendererConfig = {}, timeZone = 'Europe/Moscow' } = {}) {
  return blogWith([], {
    renderers: { html: html(rendererConfig) },
    base: 'https://nko.io',
    timeZone,
    clock: CLOCK
  });
}

async function withBlog(fn, options) {
  await using md = markdown();
  const blog = await makeBlog({
    ...options,
    rendererConfig: {
      prepare: (source, ctx) => prepare(source, [md, md.html(), md.clean()], ctx),
      ...options?.rendererConfig
    }
  });

  try {
    await fn(blog);
  } finally {
    await blog.close();
  }
}

test('post.render(html) returns view shape with body+preview as HTML', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({
      title: 'T',
      text: '# H\n\n**bold**',
      preview: 'Some _italic_ text',
      cover: { url: '/covers/t.jpg' },
      tags: ['javascript'],
      author: { name: 'Alex', email: 'alex@example.com' },
      meta: { title: 'Meta', description: 'Desc' },
      social: { title: 'Social' }
    });

    await post.publish();

    const out = await post.render('html');

    const expected = [
      'uri',
      'slug',
      'url',
      'title',
      'preview',
      'body',
      'cover',
      'tags',
      'author',
      'links',
      'meta',
      'social',
      'status',
      'createdAt',
      'updatedAt',
      'publishedAt',
      'publishedDate'
    ];

    for (const key of expected) {
      assert.ok(key in out, `missing field "${key}" in output`);
    }

    assert.equal('text' in out, false);
    assert.deepEqual(out.options, {});

    assert.match(out.body, /<h1>H<\/h1>/);
    assert.match(out.body, /<strong>bold<\/strong>/);
    assert.match(out.preview, /<em>italic<\/em>/);

    assert.equal(out.url, post.url().href);
    assert.equal(out.title, 'T');
    assert.equal(out.status, 'published');
    assert.deepEqual(out.tags, ['javascript']);
    assert.equal(out.author.name, 'Alex');
    assert.deepEqual(out.links.related, []);
    assert.equal(out.meta.title, 'Meta');
    assert.equal(out.social.title, 'Social');
  });
});

test('links.related omits a draft target, keeps a published one', async () => {
  await withBlog(async (blog) => {
    const draft = await blog.create({ title: 'Draft target', text: 'd' });
    const published = await blog.create({ title: 'Published target', text: 'p' });
    await published.publish();

    const post = await blog.create({
      title: 'First',
      text: 'f',
      links: { related: [draft.id, published.id] }
    });

    await post.publish();

    const out = await post.render('html');
    assert.deepEqual(out.links.related, [published.uri]);
  });
});

test('publishedAt is ISO Z, publishedDate is YYYY-MM-DD in timeZone', async () => {
  await withBlog(async (blog) => {
    const post = blog.build({ title: 'Late', text: 'x' });
    post.publishedAt = '2026-04-26T22:00:00Z';
    await post.publish();

    const out = await post.render('html');
    assert.equal(out.publishedAt, '2026-04-26T22:00:00Z');
    assert.equal(out.publishedDate, '2026-04-27');
    assert.match(out.createdAt, /Z$/);
    assert.match(out.updatedAt, /Z$/);
  });
});

test('empty preview produces empty preview output', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({
      title: 'Empty',
      text: '# Body',
      preview: ''
    });

    await post.publish();
    const out = await post.render('html');
    assert.equal(out.preview, '');
    assert.match(out.body, /<h1>Body<\/h1>/);
  });
});

test('renderer does not mutate Post', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({
      title: 'Original',
      text: '# Heading\n\nBody',
      preview: 'P',
      tags: ['a', 'b'],
      author: { name: 'X' }
    });

    await post.publish();

    const before = post.toJSON();
    await post.render('html');
    const after = post.toJSON();

    assert.ok(isDeepStrictEqual(before, after), 'post.toJSON() must not change');
  });
});

test('draft post (no publishedAt) omits publishedAt and publishedDate', async () => {
  const fakePost = new Post(
    { timeZone: 'Europe/Moscow', base: 'https://nko.io' },
    {
      id: 'post-draft',
      uri: '2026/04/draft',
      text: '',
      slug: 'draft',
      title: 'Draft',
      preview: '',
      cover: {},
      tags: [],
      author: { name: 'A' },
      links: { related: [] },
      meta: {},
      social: {},
      status: 'draft',
      createdAt: Temporal.Instant.from('2026-04-26T10:00:00Z'),
      updatedAt: Temporal.Instant.from('2026-04-26T10:00:00Z'),
      publishedAt: undefined
    }
  );

  const ctx = {
    yamb: {},
    format: 'html',
    scope: 'post',
    timeZone: 'Europe/Moscow',
    base: new URL('https://nko.io')
  };

  const out = await buildView(fakePost.toJSON(), ctx, { body: '<p>wip</p>', preview: '' });
  assert.equal('publishedAt' in out, false);
  assert.equal('publishedDate' in out, false);
  assert.equal('text' in out, false);
  assert.deepEqual(out.options, {});
  assert.equal(out.title, 'Draft');
  assert.equal(out.body, '<p>wip</p>');
  assert.equal(out.preview, '');
  assert.equal(out.status, 'draft');
  assert.equal(typeof out.createdAt, 'string');
});

test('signal abort throws AbortError', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({ title: 'X', text: 'y' });
    await post.publish();

    const ac = new AbortController();
    ac.abort();

    await assert.rejects(
      () => post.render('html', { signal: ac.signal }),
      (err) => err?.name === 'AbortError'
    );
  });
});

test('explicit preparation preserves safe inline HTML in body', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({
      title: 'Raw',
      text: '<details>secret</details>'
    });

    await post.publish();
    const out = await post.render('html');
    assert.match(out.body, /<details>secret<\/details>/);
    assert.ok(!out.body.includes('&lt;details&gt;'));
  }, {});
});

test('default renderer escapes literal HTML and keeps Markdown literal', async () => {
  const renderer = html();
  const view = await renderer.post(
    { title: 'T', text: '**bold** <details>secret</details>', uri: 'drafts/t' },
    { base: new URL('https://example.test'), timeZone: 'UTC' }
  );
  assert.equal(view.body, '**bold** &lt;details&gt;secret&lt;/details&gt;');
});

test('HTML cover views own complete, partial and empty objects', async () => {
  const renderer = html();
  const ctx = { base: new URL('https://example.com/'), timeZone: 'UTC' };

  for (const cover of [
    { url: '/cover.jpg', alt: 'Alt', caption: 'Caption', width: 10, height: 20 },
    { caption: 'No image' },
    {},
    undefined
  ]) {
    const source = { title: 'Cover', uri: 'drafts/cover', text: '', cover };
    const view = await renderer.post(source, ctx);

    assert.deepEqual(view.cover, cover ?? {});

    const caption = source.cover?.caption;
    view.cover.caption = 'View';

    assert.equal(source.cover?.caption, caption);
    assert.notStrictEqual(view.cover, source.cover);
  }
});

test('direct HTML rendering rejects invalid cover data', async () => {
  const renderer = html();
  const ctx = { base: new URL('https://example.com/'), timeZone: 'UTC' };

  for (const cover of ['/cover.jpg', null, [], { unknown: true }, { url: '//example.com/a' }]) {
    await assert.rejects(
      () => renderer.post({ title: 'Cover', uri: 'drafts/cover', text: '', cover }, ctx),
      { code: 'YAMB_RENDERER_INPUT' }
    );
  }
});
