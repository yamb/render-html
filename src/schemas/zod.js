import { z } from 'zod';

import { CoverSchema } from '#core/schemas';

const derived = z.string().refine((value) => value.length <= 5000000, {
  error: 'derived field exceeds 5000000 UTF-16 units',
  abort: true
});
const metadata = CoverSchema.in;

export const ConfigSchema = z.strictObject({ prepare: z.function().optional() });

export const PreparedCoverSchema = z.strictObject({
  ...metadata.shape,
  alt: derived.optional(),
  caption: derived.optional(),
  url: derived
    .refine((value) => {
      // oxlint-disable-next-line no-control-regex
      if (/[\\\x00-\x20\x7f]/u.test(value) || value.startsWith('//')) {
        return false;
      }

      if (value === '') {
        return true;
      }

      if (value.startsWith('/') || value.startsWith('./')) {
        return URL.canParse(value, 'https://example.invalid/');
      }

      if (!/^https?:\/\//i.test(value)) {
        return false;
      }

      const url = URL.parse(value);

      return Boolean(url) && !url.username && !url.password;
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
