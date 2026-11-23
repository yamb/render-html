import { url } from '#core/url';

export async function buildView(
  post,
  ctx,
  { title = post.title, body, preview, cover = post.cover ?? {} }
) {
  ctx.signal?.throwIfAborted();

  const related = await relatedUris(post, ctx);

  const view = {
    uri: post.uri,
    slug: post.slug,
    url: url(post.uri, ctx.base).href,
    title,
    preview: preview ?? '',
    body: body ?? '',
    cover: structuredClone(cover),
    tags: post.tags ?? [],
    author: post.author ?? {},
    links: { related },
    meta: post.meta ?? {},
    social: post.social ?? {},
    status: post.status,
    options: post.options
  };

  if (post.createdAt) {
    view.createdAt = post.createdAt.toString();
  }

  if (post.updatedAt) {
    view.updatedAt = post.updatedAt.toString();
  }

  if (post.publishedAt) {
    view.publishedAt = post.publishedAt.toString();
    view.publishedDate = Temporal.Instant.from(post.publishedAt)
      .toZonedDateTimeISO(ctx.timeZone)
      .toPlainDate()
      .toString();
  }

  return view;
}

async function relatedUris(post, ctx) {
  const ids = [...(post.links?.related ?? [])];

  if (ids.length === 0) {
    return [];
  }

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
