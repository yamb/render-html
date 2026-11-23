import { RendererInputError } from '#core/errors';
import { CoverSchema, PreviewSchema, TextSchema, TitleSchema, UriSchema } from '#core/schemas';

import { PreparedSchema } from '../../schemas/zod.js';
import { buildView } from '../../views/post.js';
import { getState } from '../internal.js';

function escape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function literal(post, cover) {
  const prepared = { title: post.title, text: { html: escape(post.text ?? '') }, cover };

  if (post.preview !== undefined) {
    prepared.preview = { html: escape(post.preview) };
  }

  return prepared;
}

export default {
  name: 'post',

  async fn(renderer, post, ctx) {
    ctx.signal?.throwIfAborted();

    if (
      !post ||
      !UriSchema.safeParse(post.uri).success ||
      typeof post.title !== 'string' ||
      post.title.length > 500 ||
      !TitleSchema.safeParse(post.title).success ||
      !TextSchema.safeParse(post.text ?? '').success ||
      post.text === null ||
      !PreviewSchema.optional().safeParse(post.preview).success
    ) {
      throw new RendererInputError('html post renderer requires valid PostData');
    }

    const cover = CoverSchema.safeParse(post.cover === undefined ? {} : post.cover);

    if (!cover.success) {
      throw new RendererInputError('invalid cover', { details: { issues: cover.error.issues } });
    }

    const source = structuredClone(post);
    const { config } = getState(renderer);
    const prepared = config.prepare
      ? await config.prepare(structuredClone(source), ctx)
      : literal(source, cover.data);
    ctx.signal?.throwIfAborted();

    const result = PreparedSchema.safeParse(prepared);

    if (!result.success) {
      throw new RendererInputError('invalid prepared post', {
        details: { issues: result.error.issues }
      });
    }

    return buildView(source, ctx, {
      title: result.data.title,
      body: result.data.text.html,
      preview: result.data.preview?.html ?? '',
      cover: result.data.cover
    });
  }
};
