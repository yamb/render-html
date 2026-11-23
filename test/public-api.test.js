import assert from 'node:assert/strict';
import test from 'node:test';

import { html } from '@meritt/yamb-render-html';
import { json } from '@meritt/yamb-render-json';
import { z } from 'zod';

import { content } from './helpers/content.js';
import { blogWith } from './perf/fixture.js';

test('invalid related input fails validation without saving a post', async () => {
  await using blog = await blogWith();

  await assert.rejects(
    () => blog.create({ title: 'Invalid links', links: { related: 'invalid' } }),
    { code: 'YAMB_POST_VALIDATION' }
  );
  assert.equal(await blog.all().count(), 0);
});

test('saved edits render prepared HTML and original JSON through the package API', async (t) => {
  const blog = await blogWith([], {
    options: z.strictObject({ homepage: z.boolean().default(false) }),
    renderers: {
      html: html({ prepare: content(t) }),
      json: json()
    }
  });

  try {
    const input = {
      title: '"Hello"',
      text: '**original**',
      tags: ['one'],
      meta: { description: 'before' }
    };
    const post = blog.build(input);
    input.tags.push('outside');
    await post.save();

    assert.equal(post.options.homepage, false);
    assert.deepEqual(post.tags, ['one']);
    assert.ok(Object.keys(post).includes('text'));
    assert.equal({ ...post }.text, '**original**');

    const detached = post.toJSON();
    detached.tags.push('snapshot');
    post.tags.push('two');
    post.meta.description = 'after';
    post.options.homepage = true;

    assert.equal(post.changes().meta.description, 'after');

    await post.publish();
    const loaded = await blog.find(post.id);

    assert.deepEqual(loaded.tags, ['one', 'two']);
    assert.equal(loaded.options.homepage, true);

    const selected = blog.published;
    assert.equal(await selected.count(), 1);
    assert.equal(await selected.map((p) => p.title).find(() => true), '"Hello"');
    delete loaded.meta.description;
    await loaded.save();
    const cleared = await blog.find(post.id);

    assert.equal(cleared.meta.description, undefined);
    assert.equal(cleared.text, '**original**');

    const view = await cleared.render('html');
    assert.equal(view.body, '<p><strong>original</strong></p>');
    const data = await cleared.render('json');
    assert.equal(data.text, '**original**');

    const ac = new AbortController();
    ac.abort();
    await assert.rejects(() => cleared.render('html', { signal: ac.signal }), {
      name: 'AbortError'
    });

    await cleared.remove();
    assert.equal(await blog.find(post.id), null);
  } finally {
    await blog.close();
  }
});
