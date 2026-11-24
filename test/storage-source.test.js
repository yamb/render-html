import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

import { yamb } from 'yamb';
import { sqlite } from 'yamb-storage-sqlite';

import { html } from '../src/index.js';
import { content } from './helpers/content.js';
import { test as sqliteTest } from './prepared-sqlite.js';

sqliteTest(
  'rendering leaves the prepared SQLite record and reloaded Markdown unchanged',
  async (t) => {
    const path = process.env.YAMB_SQLITE_FIXTURE;
    if (!path) {
      t.skip('requires the prepared SQLite fixture');
      return;
    }

    await access(path);
    const blog = yamb({
      storage: sqlite({ path }),
      renderers: { html: html({ prepare: content(t) }) }
    });
    await blog.open();
    let post;

    try {
      const text = '# "Заголовок"\r\n\r\nОн сказал "привет". `"raw" -- x`\r\n';
      const preview = '**"Анонс"**\r\n';
      post = await blog.create({
        title: '"Источник"',
        slug: `render-${crypto.randomUUID()}`,
        text,
        preview
      });
      const before = await blog.storage.find(post.id);
      const view = await post.render('html');

      assert.equal(view.title, '«Источник»');
      assert.match(view.body, /«привет»/);
      assert.match(view.body, /<code>"raw" -- x<\/code>/);
      assert.deepEqual(await blog.storage.find(post.id), before);

      const loaded = await blog.find(post.id);
      assert.equal(loaded.text, text);
      assert.equal(loaded.preview, preview);
      assert.equal(post.text, text);
      assert.equal(post.preview, preview);
    } finally {
      try {
        if (post?.id) {
          await post.remove();
        }
      } finally {
        await blog.close();
      }
    }
  }
);
