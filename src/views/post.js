import { url } from '#core/url';

export async function buildView(post, ctx, { title, body, preview, cover }) {
  const view = {
    uri: post.uri,
    slug: post.slug,
    url: url(post.uri, ctx.base).href,
    title,
    preview,
    body,
    cover,
    tags: post.tags,
    author: post.author,
    links: { related: await relatedUris(post.links.related, ctx) },
    meta: post.meta,
    social: post.social,
    status: post.status,
    options: post.options
  };

  for (const key of ['createdAt', 'updatedAt', 'publishedAt']) {
    if (post[key]) {
      view[key] = post[key].toString();
    }
  }

  if (post.publishedAt) {
    view.publishedDate = post.publishedAt.toZonedDateTimeISO(ctx.timeZone).toPlainDate().toString();
  }

  return view;
}

async function relatedUris(ids, ctx) {
  const uris = [];

  for (const id of ids) {
    ctx.signal?.throwIfAborted();
    const related = await ctx.yamb.find(id, { signal: ctx.signal });
    ctx.signal?.throwIfAborted();

    if (related?.status === 'published') {
      uris.push(related.uri);
    }
  }

  return uris;
}
