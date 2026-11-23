import assert from 'node:assert/strict';

import { html } from '@meritt/yamb-render-html';
import { yamb } from 'yamb';

import { content } from './helpers/content.js';
import { mongodb, test } from './prepared-mongodb.js';

const CLOCK = () => Temporal.Instant.from('2026-04-26T12:00:00Z');

function makeBlog() {
  return yamb({
    storage: mongodb(),
    base: 'https://example.com',
    timeZone: 'UTC',
    clock: CLOCK
  });
}

async function withBlog(fn) {
  const blog = makeBlog();

  try {
    await blog.open();
    await fn(blog);
  } finally {
    await blog[Symbol.asyncDispose]();
  }
}

test('create draft, then publish, then fetch', async () => {
  await withBlog(async (blog) => {
    const post = blog.build({ title: 'Hello, world', text: '## Body' });
    await post.save();
    assert.equal(post.status, 'draft');
    assert.equal(post.uri, 'drafts/hello-world');

    await post.publish();
    assert.equal(post.status, 'published');
    assert.match(post.uri, /^2026\/04\/hello-world/);

    const fetched = await blog.fetch(post.uri);
    assert.equal(fetched.title, 'Hello, world');
  });
});

test('freeform transition: archive a never-published draft, then publish stamps a dated uri', async () => {
  await withBlog(async (blog) => {
    const post = blog.build({ title: 'Shelved', text: '...' });
    await post.save();
    assert.equal(post.status, 'draft');
    assert.equal(post.uri, 'drafts/shelved');
    assert.equal(post.publishedAt, undefined);

    await post.archive();
    assert.equal(post.status, 'archived');
    assert.equal(post.uri, 'drafts/shelved', 'dateless archived post keeps a drafts/ uri');

    await post.publish();
    assert.equal(post.status, 'published');
    assert.ok(post.publishedAt, 'publishing a dateless post stamps a date');
    assert.match(post.uri, /^2026\/04\/shelved/, 'published post gets a dated uri, not drafts/');

    const fetched = await blog.fetch(post.uri);
    assert.equal(fetched.title, 'Shelved');
  });
});

test('freeform transition: published → draft retains publishedAt; republish keeps the original date', async () => {
  await withBlog(async (blog) => {
    const post = blog.build({ title: 'Live', text: '...', status: 'published' });
    await post.save();
    const originalDate = post.publishedAt.toString();
    assert.match(post.uri, /^2026\/04\/live/);

    post.status = 'draft';
    await post.save();
    assert.equal(post.status, 'draft');
    assert.equal(post.uri, 'drafts/live', 'status drives the uri back to drafts/');
    assert.equal(post.publishedAt.toString(), originalDate, 'date retained on unpublish');

    await post.publish();
    assert.equal(post.publishedAt.toString(), originalDate, 'republish keeps the original date');
    assert.match(post.uri, /^2026\/04\/live/);
  });
});

test('freeform transition: cancel a scheduled post back to draft', async () => {
  await withBlog(async (blog) => {
    const post = blog.build({ title: 'Planned', text: '...' });
    await post.schedule(Temporal.Instant.from('2026-12-01T00:00:00Z'));
    assert.equal(post.status, 'scheduled');
    assert.match(post.uri, /^2026\/12\/planned/);

    post.status = 'draft';
    await post.save();
    assert.equal(post.status, 'draft');
    assert.equal(post.uri, 'drafts/planned', 'cancelled scheduled post returns to drafts/');
  });
});

test('blog.all() includes drafts and blog.published selects public posts', async () => {
  await withBlog(async (blog) => {
    await blog.create({ title: 'A', text: '...', status: 'published' });
    await blog.create({ title: 'B', text: '...', status: 'draft' });
    await blog.create({ title: 'C', text: '...', status: 'published' });

    const posts = await blog.all().toArray();
    const titles = posts.map((p) => p.title);
    assert.equal(titles.length, 3);
    assert.equal(await blog.published.count(), 2);
    assert.ok(titles.includes('A'));
    assert.ok(titles.includes('C'));
  });
});

test('offset paginates a published listing and pairs with count() for "page N of M"', async () => {
  await withBlog(async (blog) => {
    for (let i = 0; i < 6; i++) {
      const p = blog.build({ title: `P${i}`, slug: `p${i}`, text: '...', status: 'published' });
      p.publishedAt = Temporal.Instant.from(`2026-04-1${i}T00:00:00Z`);
      await p.save();
    }

    assert.equal(await blog.published.count(), 6);

    const order = '-publishedAt';
    const pageTitles = async (n) => {
      const posts = await blog
        .all({ status: 'published' }, { order, limit: 2, offset: n })
        .toArray();

      return posts.map((p) => p.title);
    };

    assert.deepEqual(await pageTitles(0), ['P5', 'P4']);
    assert.deepEqual(await pageTitles(2), ['P3', 'P2']);
    assert.deepEqual(await pageTitles(4), ['P1', 'P0']);

    assert.equal(await blog.all({ status: 'published' }, { offset: 4, limit: 2 }).count(), 6);

    const viaScope = await blog.published.order(order).offset(2).limit(2).toArray();
    assert.deepEqual(
      viaScope.map((p) => p.title),
      ['P3', 'P2']
    );
  });
});

test('scope chain: blog.published.tagged(...).recent()', async () => {
  await withBlog(async (blog) => {
    await blog.create({
      title: 'JS',
      text: '...',
      status: 'published',
      tags: ['js']
    });

    await blog.create({
      title: 'Ruby',
      text: '...',
      status: 'published',
      tags: ['ruby']
    });

    const posts = await blog.published.tagged('js').recent(5).toArray();
    const titles = posts.map((p) => p.title);
    assert.deepEqual(titles, ['JS']);
  });
});

test('rename slug: related links survive via id stability', async () => {
  await withBlog(async (blog) => {
    const arch = await blog.create({
      title: 'Architecture',
      text: '...',
      status: 'published'
    });

    const hello = blog.build({
      title: 'Hello',
      text: '...',
      status: 'published'
    });

    hello.links = { related: [arch.id] };
    await hello.save();

    arch.slug = 'arch';
    await arch.save();

    const refetched = await blog.fetch('2026/04/hello');
    assert.deepEqual(refetched.links.related, [arch.id]);
  });
});

test('id is stable across rename', async () => {
  await withBlog(async (blog) => {
    const post = blog.build({
      title: 'Original',
      text: '...',
      status: 'published'
    });

    await post.save();
    const { id } = post;
    const oldUri = post.uri;
    assert.ok(id, 'id assigned after first save');

    post.slug = 'renamed';
    await post.save();

    assert.equal(post.id, id, 'id unchanged after rename');
    assert.notEqual(post.uri, oldUri, 'uri changed after rename');
    assert.equal(await blog.fetch(oldUri), null, 'old uri no longer resolves');

    const byUri = await blog.fetch(post.uri);
    assert.equal(byUri.id, id, 'new uri resolves to same id');

    const byId = await blog.find(id);
    assert.equal(byId.uri, post.uri, 'find(id) returns post with new uri');
  });
});

test('links.related keeps the id after renaming a referent', async () => {
  await withBlog(async (blog) => {
    const arch = await blog.create({
      title: 'Architecture',
      text: '...',
      status: 'published'
    });

    const hello = blog.build({
      title: 'Hello',
      text: '...',
      status: 'published'
    });

    hello.links = { related: [arch.id] };
    await hello.save();

    arch.slug = 'arch-v2';
    await arch.save();

    const refetched = await blog.fetch(hello.uri);

    assert.deepEqual(refetched.links.related, [arch.id], 'getter preserves the stable related id');
  });
});

test('stale related ids stay visible to the editor', async () => {
  await withBlog(async (blog) => {
    const arch = await blog.create({
      title: 'Architecture',
      text: '...',
      status: 'published'
    });

    const hello = blog.build({
      title: 'Hello',
      text: '...',
      status: 'published'
    });

    hello.links = { related: [arch.id] };
    await hello.save();

    await arch.remove();

    const refetched = await blog.fetch(hello.uri);
    assert.deepEqual(refetched.links.related, [arch.id], 'stale id remains visible to the editor');
  });
});

test('create() with a caller-supplied existing id is rejected, not an overwrite', async () => {
  await withBlog(async (blog) => {
    const victim = await blog.create({
      title: 'Legit Post',
      text: 'original body',
      status: 'published'
    });

    await assert.rejects(
      () =>
        blog.create({
          id: victim.id,
          title: 'pwned',
          text: 'attacker body',
          status: 'published'
        }),
      { code: 'YAMB_POST_VALIDATION' }
    );

    const fetched = await blog.find(victim.id);
    assert.equal(fetched.title, 'Legit Post', 'victim post is untouched');
    assert.equal(fetched.text, 'original body');
  });
});

test('orders same-second posts chronologically (fixed-precision storage)', async () => {
  await withBlog(async (blog) => {
    const late = blog.build({ title: 'Late', text: '...', status: 'published' });
    late.publishedAt = Temporal.Instant.from('2026-04-26T12:00:00.5Z');
    await late.save();

    const early = blog.build({ title: 'Early', text: '...', status: 'published' });
    early.publishedAt = Temporal.Instant.from('2026-04-26T12:00:00Z');
    await early.save();

    const titles = [];

    for await (const p of blog.all({}, { order: 'publishedAt', limit: 10 })) {
      titles.push(p.title);
    }

    assert.deepEqual(titles, ['Early', 'Late']);
  });
});

test('next()/prev() navigate same-publishedAt posts by uri tiebreak', async () => {
  await withBlog(async (blog) => {
    const ts = Temporal.Instant.from('2026-04-26T10:00:00Z');

    const mk = async (slug) => {
      const p = blog.build({ title: slug, slug, text: '...', status: 'published' });
      p.publishedAt = ts;
      await p.save();

      return p;
    };

    await mk('aaa');
    const b = await mk('bbb');
    await mk('ccc');

    const next = await b.next();
    const prev = await b.prev();
    assert.equal(next?.uri, '2026/04/ccc', 'next picks the greater uri at same instant');
    assert.equal(prev?.uri, '2026/04/aaa', 'prev picks the lesser uri at same instant');
  });
});

test('next() excludes future-dated published posts (clock cap)', async () => {
  await withBlog(async (blog) => {
    const current = blog.build({ title: 'Current', text: '...', status: 'published' });
    current.publishedAt = Temporal.Instant.from('2026-04-26T10:00:00Z');
    await current.save();

    const future = blog.build({ title: 'Future', text: '...', status: 'published' });
    future.publishedAt = Temporal.Instant.from('2026-12-31T00:00:00Z');
    await future.save();

    assert.equal(await current.next(), null);
  });
});

test('create() with an invalid status is rejected (whole-object validation)', async () => {
  await withBlog(async (blog) => {
    await assert.rejects(
      () => blog.create({ title: 'X', text: '...', status: 'TOTALLY_INVALID' }),
      { code: 'YAMB_POST_VALIDATION' }
    );

    assert.deepEqual(await blog.all().toArray(), []);
  });
});

test('for await iterates blog like all()', async () => {
  await withBlog(async (blog) => {
    await blog.create({ title: 'X', text: '...', status: 'published' });

    const titles = [];

    for await (const p of blog) {
      titles.push(p.title);
    }

    assert.deepEqual(titles, ['X']);
  });
});

test('blog.fetch returns null for missing', async () => {
  await withBlog(async (blog) => {
    assert.equal(await blog.fetch('2026/04/missing'), null);
  });
});

test('blog.uri throws YAMB_URI_ORIGIN_MISMATCH for foreign origin', async () => {
  await withBlog(async (blog) => {
    assert.throws(() => blog.uri('https://other.com/2026/04/x'), {
      code: 'YAMB_URI_ORIGIN_MISMATCH'
    });
  });
});

test('async iterator + cancellation', async () => {
  await withBlog(async (blog) => {
    await blog.create({ title: 'A', text: '...', status: 'published' });

    const ac = new AbortController();
    ac.abort();

    await assert.rejects(
      async () => {
        for await (const _ of blog.all({}, { signal: ac.signal })) {
          void _;
        }
      },
      { name: 'AbortError' }
    );
  });
});

test('save and render keep original Markdown through typography and later edits', async (t) => {
  const blog = yamb({
    storage: mongodb(),
    base: 'https://example.com',
    clock: CLOCK,
    renderers: { html: html({ prepare: content(t) }) }
  });
  await blog.open();

  try {
    const text = 'Use `--no-verify` to bypass; a -- b';
    const post = await blog.create({ title: '"Привет" -- мир', text });
    const first = await post.render('html');

    assert.match(first.title, /«Привет»/);
    assert.match(first.body, /<code>--no-verify<\/code>/);
    assert.match(first.body, /—/);
    assert.equal(post.title, '"Привет" -- мир');
    assert.equal(post.text, text);

    await post.save();
    const loaded = await blog.find(post.id);

    assert.equal(loaded.text, text);
    assert.equal(loaded.title, post.title);

    post.title = '"Второй"';
    await post.save();
    const second = await post.render('html');

    assert.match(second.title, /«Второй»/);
    assert.equal(second.body, first.body);
    assert.equal(post.text, text);
  } finally {
    await blog.close();
  }
});
