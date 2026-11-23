import assert from 'node:assert/strict';

import pkg from './package.json' with { type: 'json' };

const { html } = await import(pkg.name);

import { blogWith } from './test/perf/fixture.js';

await using blog = await blogWith([], {
  base: 'https://example.test/blog',
  renderers: { html: html() }
});

const post = await blog.create({ title: 'Example', text: '<body>& text</body>' });
const view = await post.render('html');
assert.equal(view.body, '&lt;body&gt;&amp; text&lt;/body&gt;');
