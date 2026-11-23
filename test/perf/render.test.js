import assert from 'node:assert/strict';
import test from 'node:test';

import { html } from '../../src/index.js';
import { content } from '../helpers/content.js';
import { blogWith, postData } from './fixture.js';
import { conditions, measure } from './measure.js';

test('HTML preparation and prepared projections on project post data', async (t) => {
  conditions(t);
  const prepare = content(t);
  let shared;
  const renderer = html({ prepare: (source, ctx) => shared ?? prepare(source, ctx) });
  const blog = await blogWith([], { renderers: { html: renderer } });
  t.after(() => blog.close());

  for (const kib of [1, 16, 256]) {
    const post = await blog.create(postData(kib * 1024, kib));
    shared = undefined;
    const cold = await measure(t, `render/${kib}KiB/warm-html-microtypo`, () =>
      post.render('html')
    );

    assert.match(cold.body, /<h1[^>]*>Yamb baseline<\/h1>/);

    shared = await prepare(post.toJSON(), { base: new URL(blog.base), timeZone: blog.timeZone });
    const warmed = await post.render('html');
    assert.deepEqual(warmed, cold);

    const hot = await measure(
      t,
      `render/${kib}KiB/prepared-projection`,
      async () => {
        let view;

        for (let i = 0; i < 100; i++) {
          view = await post.render('html');
        }

        return view;
      },
      100
    );

    assert.deepEqual(hot, warmed);
    assert.equal(post.text, postData(kib * 1024, kib).text);
  }
});
