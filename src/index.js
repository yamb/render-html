import { HtmlRenderer } from './renderer/index.js';

export function html(config = {}) {
  return new HtmlRenderer(config);
}

export { HtmlRenderer };
