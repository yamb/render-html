# yamb-render-html

[![npm version][npm-image]][npm-url] [![Build status][github-actions-image]][github-actions-url] [![Coverage status][coveralls-image]][coveralls-url] [![Dependency status][libraries-image]][libraries-url]

Render individual [Yamb](https://github.com/yamb/yamb) posts as view objects with body and preview fragments, a canonical URL and metadata for templates.

For GitHub Packages, route the `@yamb` scope to `https://npm.pkg.github.com` and install `@yamb/render-html`.

## Quick start

Requires Node.js 26.13 or later and `yamb`. Direct rendering needs no storage.

```bash
pnpm add yamb yamb-render-html
```

```js
import { html } from 'yamb-render-html';

const source = {
  uri: '2026/11/hello',
  title: 'Hello',
  text: 'Hello, <world>.'
};

const ctx = {
  base: new URL('https://example.com/blog'),
  timeZone: 'UTC'
};

const view = await html().post(source, ctx);

console.log(view.url);
console.log(view.body);
```

For Markdown, see the [preparation example](#preparation).

## Reference

Register `renderers: { html: html() }` in the [Yamb configuration](https://github.com/yamb/yamb#reference) to use `post.render('html')` or `blog.render('html', { post: post.toJSON() })`. Collection dispatch fails with `YAMB_RENDERER_SCOPE`.

### Preparation

`html({ prepare }?)` and `new HtmlRenderer(config?)` accept an optional `(source, ctx) => PreparedPost | Promise<PreparedPost>` callback. Unknown keys fail with `YAMB_HTML_RENDERER_CONFIG`. The default escapes the body and preview as literal text.

For Markdown and typography, add the preparation stages.

```bash
pnpm add yamb-markdown yamb-microtypo
```

```js
import { markdown } from 'yamb-markdown';
import { microtypo } from 'yamb-microtypo';
import { html } from 'yamb-render-html';
import { prepare } from 'yamb/transform';

await using md = markdown();
await using typo = microtypo();

const stages = [md, md.html(), typo, md.clean()];

const renderer = html({
  prepare: (source, ctx) => prepare(source, stages, ctx)
});

const source = {
  uri: '2026/11/article',
  title: '"An article"',
  text: 'Introduction.\n\n---\n\nThe **complete** article.',
  preview: 'A separate **summary**.',
  cover: {
    caption: '"Cover caption"'
  }
};

const ctx = {
  base: new URL('https://example.com/blog'),
  timeZone: 'UTC'
};

const view = await renderer.post(source, ctx);

console.log(view.body);
```

Reuse the Markdown and MicroTypo owners and close them after preparation completes. See [Markdown](https://github.com/yamb/markdown#reference) for stage shapes and sanitation and [MicroTypo](https://github.com/yamb/microtypo#reference) for typography settings.

Direct calls take PostData with a canonical `uri`, a `ctx.base` URL and `ctx.timeZone`. The renderer snapshots the source, validates every field it reads with core’s post schemas and passes the snapshot to `prepare`; the view keeps its own copy. A live Post fails; pass `post.toJSON()`. Related IDs resolve in order through `ctx.yamb.find(id, { signal })`; only current published targets contribute URIs.

### View

| View fields | Value / presence |
| --- | --- |
| `uri`, `slug`, `status`, `options` | Captured source values; keys are present even when a direct source omits a value |
| `url` | Absolute post URL string |
| `title` | Plain title from the prepared post or source |
| `body` | Prepared `text.html` or escaped source text, including the introduction |
| `preview` | Prepared `preview.html` or escaped source preview, defaulting to `''` |
| `cover` | Prepared cover, or validated source cover in literal mode; defaults to `{}` |
| `tags`, `author`, `meta`, `social` | Captured source values; default to `[]`, `{}`, `{}`, `{}` |
| `links` | `{ related: string[] }`, containing resolved published URIs |
| `createdAt`, `updatedAt` | UTC instant strings, included when present in the source |
| `publishedAt`, `publishedDate` | Included when source `publishedAt` is present; UTC instant string and `YYYY-MM-DD` in `ctx.timeZone` |

View objects own their nested metadata. Read the source ID and Markdown from the Post, and the final HAST from PreparedPost. In lists, use `prepared.preview === undefined ? prepared.text.html : prepared.preview.html` to preserve an explicitly empty preview.

### Safety and failures

The renderer passes prepared HTML through to `body` and `preview`. A custom `prepare` must sanitize both fragments. In the Markdown pipeline, run `md.clean()` after the last HTML-producing stage. Escape plain fields and attribute values in templates.

Source title, text and preview are limited to 500, 1048576 and 5000 UTF-16 units, and a post resolves at most 50 related IDs. Prepared title, body, preview, cover URL, alt and caption each allow 5000000 units. The core cover rules still apply to URL syntax and dimensions.

Invalid source or prepared fields fail with `YAMB_RENDERER_INPUT`. Direct `renderer.post` calls propagate callback errors; registered calls use core’s renderer error boundary. Cancellation preserves the native reason.

## Author

[Alexey Simonenko](https://simonenko.xyz)

## License

MIT. See `LICENSE`.

[npm-image]: https://img.shields.io/npm/v/yamb-render-html?style=flat
[npm-url]: https://www.npmjs.com/package/yamb-render-html
[github-actions-image]: https://github.com/yamb/render-html/actions/workflows/ci.yml/badge.svg
[github-actions-url]: https://github.com/yamb/render-html/actions/workflows/ci.yml
[coveralls-image]: https://coveralls.io/repos/github/yamb/render-html/badge.svg
[coveralls-url]: https://coveralls.io/github/yamb/render-html
[libraries-image]: https://img.shields.io/librariesio/release/npm/yamb-render-html?style=flat
[libraries-url]: https://libraries.io/npm/yamb-render-html
