import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';

import { html } from '../src/index.js';
import { content } from './helpers/content.js';
import { blogWith } from './perf/fixture.js';

async function setup(t, config = {}) {
  const blog = await blogWith([], {
    base: 'https://example.com/blog',
    timeZone: 'Europe/Istanbul',
    renderers: { html: html(config) }
  });
  t.after(() => blog.close());

  return blog;
}

test('one whole-record preparation retains the captured revision across a gate', async (t) => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const prepare = content(t);
  let calls = 0;
  const blog = await setup(t, {
    async prepare(source, ctx) {
      calls++;
      entered.resolve();
      await release.promise;
      return prepare(source, ctx);
    }
  });
  const text =
    'Он сказал "привет". **жирный**\r\n\r\n`"raw" -- x`\r\n\r\n<script>alert("x")</script>';
  const post = await blog.create({
    title: '"Заголовок"',
    text,
    preview: '*анонс*',
    cover: { caption: '"Подпись"' }
  });
  const rendering = post.render('html');
  await entered.promise;

  post.title = 'Поздний';
  post.text = 'Поздний';
  post.preview = 'Поздний';
  post.cover.caption = 'Поздний';
  post.tags.push('late');

  release.resolve();
  const out = await rendering;

  assert.equal(calls, 1);
  assert.equal(out.title, '«Заголовок»');
  assert.match(out.body, /<strong>жирный<\/strong>/);
  assert.match(out.body, /«привет»/);
  assert.match(out.body, /<code>"raw" -- x<\/code>/);
  assert.doesNotMatch(out.body, /<script>/);
  assert.equal(out.preview, '<p><em>анонс</em></p>');
  assert.equal(out.cover.caption, '«Подпись»');
  assert.deepEqual(out.tags, []);
  assert.equal((await blog.find(post.id)).text, text);
});

test('HTML resolves snapshot related IDs through public blog and keeps string dates and mount path', async (t) => {
  const blog = await setup(t);
  const related = await blog.create({ title: 'Target' });
  await related.publish();
  const hidden = await blog.create({ title: 'Hidden' });
  const owner = await blog.create({ title: 'Owner', links: { related: [hidden.id, related.id] } });
  await owner.publish();
  const data = owner.toJSON();

  related.slug = 'renamed';
  await related.save();

  const out = await blog.render('html', { post: data });

  assert.deepEqual(out.links.related, ['2026/11/renamed']);
  assert.equal(out.publishedDate, '2026-11-10');
  assert.equal(out.publishedAt, '2026-11-10T09:00:00Z');
  assert.equal(out.url, 'https://example.com/blog/2026/11/owner');
  assert.deepEqual(data.links.related, [hidden.id, related.id]);
});

test('HTML preserves an inner operation AbortError while the render signal remains active', async (t) => {
  const outer = new AbortController();
  let cancellation;
  const blog = await setup(t, {
    async prepare(source) {
      const inner = new AbortController();
      const operation = setTimeout(10000, source, { signal: inner.signal });
      inner.abort();

      try {
        return await operation;
      } catch (error) {
        cancellation = error;
        throw error;
      }
    }
  });
  const post = blog.build({ title: 'Before', slug: 'before', text: '**source**' });

  await assert.rejects(
    post.render('html', { signal: outer.signal }),
    (error) => error === cancellation && error.name === 'AbortError'
  );
  assert.equal(outer.signal.aborted, false);
  assert.equal(post.text, '**source**');
});
