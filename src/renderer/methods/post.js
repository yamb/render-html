import { RendererInputError } from '#core/errors';

import { PreparedSchema, SourceSchema } from '../../schemas/zod.js';
import { buildView } from '../../views/post.js';
import { getState } from '../internal.js';

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escape(value) {
  return value.replaceAll(/[&<>"']/g, (char) => entities[char]);
}

function literal(data) {
  const prepared = { title: data.title, text: { html: escape(data.text) }, cover: data.cover };

  if (data.preview !== undefined) {
    prepared.preview = { html: escape(data.preview) };
  }

  return prepared;
}

function snapshot(post) {
  try {
    return structuredClone(post);
  } catch (cause) {
    throw new RendererInputError('html post renderer requires PostData; use post.toJSON()', {
      cause
    });
  }
}

function parse(schema, value, message) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new RendererInputError(message, { details: { issues: result.error.issues } });
  }

  return result.data;
}

export default {
  name: 'post',

  async fn(renderer, post, ctx) {
    ctx.signal?.throwIfAborted();

    const source = snapshot(post);
    const data = parse(SourceSchema, source, 'html post renderer requires valid PostData');
    const { config } = getState(renderer);
    const prepared = config.prepare ? await config.prepare(source, ctx) : literal(data);
    ctx.signal?.throwIfAborted();

    const result = parse(PreparedSchema, prepared, 'invalid prepared post');

    return buildView(data, ctx, {
      title: result.title,
      body: result.text.html,
      preview: result.preview?.html ?? '',
      cover: result.cover
    });
  }
};
