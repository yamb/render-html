import { z } from 'zod';

import {
  AuthorSchema,
  CoverSchema,
  InstantSchema,
  LinksSchema,
  MetaSchema,
  PostOptionsSchema,
  PreviewSchema,
  SlugSchema,
  SocialSchema,
  StatusSchema,
  TagsSchema,
  TextSchema,
  TitleSchema,
  UriSchema
} from '#core/schemas';

const derived = z.string().refine((value) => value.length <= 5000000, {
  error: 'derived field exceeds 5000000 UTF-16 units',
  abort: true
});

export const ConfigSchema = z.strictObject({ prepare: z.function().optional() });

export const SourceSchema = z.object({
  uri: UriSchema,
  slug: SlugSchema.optional(),
  title: z.string().max(500).pipe(TitleSchema),
  status: StatusSchema.optional(),
  text: TextSchema.default(''),
  preview: PreviewSchema.optional(),
  cover: CoverSchema.default(() => ({})),
  tags: TagsSchema.default(() => []),
  links: LinksSchema.default(() => ({ related: [] })),
  author: AuthorSchema.default(() => ({})),
  meta: MetaSchema.default(() => ({})),
  social: SocialSchema.default(() => ({})),
  createdAt: InstantSchema.optional(),
  updatedAt: InstantSchema.optional(),
  publishedAt: InstantSchema.optional(),
  options: PostOptionsSchema.optional()
});

const PreparedCoverSchema = z.strictObject({
  ...CoverSchema.in.shape,
  alt: derived.optional(),
  caption: derived.optional(),
  url: derived
    .refine((value) => {
      // oxlint-disable-next-line no-control-regex
      if (/[\\\x00-\x20\x7f]/u.test(value) || value.startsWith('//')) {
        return false;
      }

      if (value === '' || value.startsWith('/') || value.startsWith('./')) {
        return true;
      }

      const url = /^https?:\/\//i.test(value) ? URL.parse(value) : null;

      return url !== null && !url.username && !url.password;
    }, 'invalid prepared cover URL')
    .optional()
});

const ContentSchema = z.object({ html: derived });

export const PreparedSchema = z.object({
  title: derived,
  text: ContentSchema,
  preview: ContentSchema.optional(),
  cover: PreparedCoverSchema
});
