import assert from 'node:assert/strict';
import test from 'node:test';

import { markdown } from 'yamb-markdown';
import { prepare } from 'yamb/transform';

import { html } from '../src/index.js';
import { blogWith } from './perf/fixture.js';

const CLOCK = () => Temporal.Instant.from('2026-04-26T12:00:00Z');

function makeBlog(rendererConfig = {}) {
  return blogWith([], {
    renderers: { html: html(rendererConfig) },
    base: 'https://nko.io',
    timeZone: 'Europe/Moscow',
    clock: CLOCK
  });
}

async function withBlog(fn, opts = {}) {
  await using md = markdown();
  const blog = await makeBlog({
    prepare: (source, ctx) => prepare(source, [md, md.html(), md.clean()], ctx),
    ...opts.rendererConfig
  });

  try {
    await fn(blog);
  } finally {
    await blog.close();
  }
}

test('post.render(html) returns view with body HTML', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({
      title: 'Hello',
      text: '# Heading\n\nParagraph text.',
      preview: '_lead_'
    });

    await post.publish();
    const out = await post.render('html');
    assert.match(out.body, /<h1>Heading<\/h1>/);
    assert.match(out.preview, /<em>lead<\/em>/);
    assert.equal('text' in out, false);
  });
});

test("blog.render('html', { posts }) throws YAMB_RENDERER_SCOPE (post-only renderer)", async () => {
  await withBlog(async (blog) => {
    await assert.rejects(
      () => blog.render('html', { posts: blog.all() }),
      (err) => err?.code === 'YAMB_RENDERER_SCOPE' && err?.name === 'RendererScopeError'
    );
  });
});

test("post.render('rss') throws YAMB_RENDERER_MISSING (not registered)", async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({ title: 'T', text: 'body' });
    await post.publish();

    await assert.rejects(
      () => post.render('rss'),
      (err) => err?.code === 'YAMB_RENDERER_MISSING' && err?.name === 'RendererMissingError'
    );
  });
});

test('explicit preparation preserves safe inline HTML in body', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({
      title: 'Raw',
      text: '<details><summary>x</summary>secret</details>'
    });

    await post.publish();
    const out = await post.render('html');
    assert.match(out.body, /<details>/);
    assert.match(out.body, /<summary>x<\/summary>/);
    assert.ok(!out.body.includes('&lt;details&gt;'));
  }, {});
});

test('unknown config key is rejected by strictObject schema', () => {
  assert.throws(() => html({ highlight: false }), { code: 'YAMB_HTML_RENDERER_CONFIG' });
});
