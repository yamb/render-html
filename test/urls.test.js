import assert from 'node:assert/strict';
import test from 'node:test';

import { RendererInputError } from 'yamb/errors';

import { html } from '../src/index.js';
import { blogWith } from './perf/fixture.js';

for (const base of [
  'https://example.com/',
  'https://example.com/blog',
  'https://example.com/blog/',
  'https://example.com/blog?view=1#section'
]) {
  test(`HTML and Post.url agree at ${base}`, async (t) => {
    const blog = await blogWith([], { base, renderers: { html: html() } });
    t.after(() => blog.close());

    const post = blog.build({ title: 'Post', slug: 'post', text: 'Body' });
    await post.publish();

    const expected = `https://example.com${new URL(base).pathname === '/' ? '' : '/blog'}/2026/11/post`;
    assert.equal(post.url().href, expected);

    const view = await post.render('html');
    assert.equal(view.url, expected);
  });
}

test('direct and blog HTML rendering reject noncanonical source URIs before preparation', async () => {
  let calls = 0;

  for (const prepare of [
    undefined,
    (source) => {
      calls++;
      source.uri = 'drafts/safe';
      return { title: 'Safe', text: { html: '<p>Safe</p>' }, cover: {} };
    }
  ]) {
    const renderer = html({ prepare });
    await using blog = await blogWith([], { renderers: { html: renderer } });

    for (const uri of [
      'javascript:alert(document.domain)',
      'data:text/html,<script>alert(1)</script>',
      'https://outside.test/article',
      '//outside.test/article',
      '/2026/11/article',
      '../article',
      '2026/11/article?x=1',
      'drafts/Article',
      '',
      undefined,
      null,
      42
    ]) {
      const source = { title: 'Read <article>', text: '<p>Safe & "quoted"</p>', uri };
      const before = structuredClone(source);

      for (const render of [
        () =>
          renderer.post(source, { base: new URL('https://example.test/blog'), timeZone: 'UTC' }),
        () => blog.render('html', { post: source })
      ]) {
        await assert.rejects(render, (error) => {
          assert.ok(error instanceof RendererInputError);
          assert.equal(error.code, 'YAMB_RENDERER_INPUT');

          return true;
        });
      }

      assert.deepEqual(source, before);
    }
  }

  assert.equal(calls, 0);
});

test('canonical published and draft URIs preserve literal and prepared views below a base directory', async () => {
  for (const prepare of [
    undefined,
    (source) => {
      source.uri = 'javascript:alert(1)';
      return { title: 'Prepared', text: { html: '<p>Prepared</p>' }, cover: {} };
    }
  ]) {
    const renderer = html({ prepare });
    const base = 'https://example.test/blog';
    await using blog = await blogWith([], { base, renderers: { html: renderer } });

    for (const uri of ['2026/11/article', 'drafts/article']) {
      const source = { title: 'Read <article>', text: '**Body** <b>& "\'</b>', uri };
      const before = structuredClone(source);
      const direct = await renderer.post(source, { base: new URL(base), timeZone: 'UTC' });
      const view = await blog.render('html', { post: source });

      for (const output of [direct, view]) {
        assert.equal(output.uri, uri);
        assert.equal(output.url, `${base}/${uri}`);
        assert.equal(output.title, prepare ? 'Prepared' : source.title);
        assert.equal(
          output.body,
          prepare ? '<p>Prepared</p>' : '**Body** &lt;b&gt;&amp; &quot;&#39;&lt;/b&gt;'
        );
      }

      assert.deepEqual(source, before);
    }
  }
});
