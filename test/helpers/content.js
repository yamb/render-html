import { markdown } from '@meritt/yamb-markdown';
import { microtypo } from '@meritt/yamb-microtypo';
import { prepare } from 'yamb/transform';

export function content(t) {
  const md = markdown();
  const typo = microtypo();
  const stages = [md, md.html(), typo, md.clean()];

  t.after(async () => {
    await Promise.all([md.close(), typo.close()]);
  });

  return (source, ctx) => prepare(source, stages, ctx);
}
