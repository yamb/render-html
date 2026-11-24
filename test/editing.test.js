import assert from 'node:assert/strict';
import test from 'node:test';

import { z } from 'zod';

import { blogWith } from './perf/fixture.js';

const EditingOptionsSchema = z.strictObject({
  items: z.json().optional(),
  nested: z.json().optional(),
  first: z.json().optional(),
  second: z.json().optional()
});

test('built-in renderers export live data and current published related URIs', async () => {
  const { html } = await import('yamb-render-html');
  const { json } = await import('yamb-render-json');
  const blog = await blogWith([], { options: EditingOptionsSchema });
  const ctx = { yamb: blog, timeZone: 'UTC', base: new URL('https://example.com/') };

  try {
    const target = await blog.create({ title: 'Target', status: 'published' });
    const draft = await blog.create({ title: 'Hidden' });
    const post = await blog.create({
      title: 'Rendered',
      text: '**source**',
      tags: ['js'],
      author: { name: 'Alice' },
      meta: { description: 'Description' },
      social: { title: 'Social' },
      options: { nested: { count: 1 } },
      links: { related: [target.id, draft.id] }
    });

    post.tags.push('live');
    post.meta.description = 'Edited description';
    target.slug = 'renamed-target';
    await target.save();

    for (const renderer of [html(), json({ related: 'uri' }), json({ related: 'full' })]) {
      const view = await renderer.post(post.toJSON(), ctx);

      assert.deepEqual(view.tags, ['js', 'live']);
      assert.equal(view.author.name, 'Alice');
      assert.equal(view.meta.description, 'Edited description');
      assert.equal(view.social.title, 'Social');
      assert.equal(view.options.nested.count, 1);
      assert.deepEqual(view.links.related, ['2026/11/renamed-target']);

      if (renderer.name === 'html') {
        assert.equal(view.body, '**source**');
      }

      view.tags.push('external');
      view.meta.description = 'External';
      view.options.nested.count = 9;

      assert.deepEqual(post.tags, ['js', 'live']);
      assert.equal(post.meta.description, 'Edited description');
      assert.equal(post.options.nested.count, 1);
    }

    const summaries = await json().collection({ posts: [post.toJSON()] }, ctx);
    assert.deepEqual(summaries.posts[0].tags, ['js', 'live']);

    summaries.posts[0].tags.push('external');
    assert.deepEqual(post.tags, ['js', 'live']);

    const full = await json().collection(
      { posts: [post.toJSON(), target.toJSON()], view: 'full' },
      ctx
    );

    assert.deepEqual(full.posts[0].options, { nested: { count: 1 } });
    assert.deepEqual(full.posts[1].options, {});

    full.posts[0].options.nested.count = 9;
    assert.equal(post.options.nested.count, 1);
  } finally {
    await blog.close();
  }
});
