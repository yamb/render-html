import assert from 'node:assert/strict';

import { yamb } from 'yamb';

import { html } from '../src/index.js';
import { content } from './helpers/content.js';
import { sqlite, test as sqliteTest } from './prepared-sqlite.js';

sqliteTest(
  'rendering leaves the prepared SQLite record and reloaded Markdown unchanged',
  async (t) => {
    await using blog = await yamb({
      storage: sqlite(),
      renderers: { html: html({ prepare: content(t) }) }
    }).open();
    const text = '# "Заголовок"\r\n\r\nОн сказал "привет". `"raw" -- x`\r\n';
    const preview = '**"Анонс"**\r\n';
    const post = await blog.create({ title: '"Источник"', text, preview });
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
  }
);
