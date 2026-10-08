type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | EventListener | undefined>;

/**
 * Tiny element builder. Text goes through text nodes (never innerHTML),
 * so names coming from imported saves cannot inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') node.addEventListener(name.replace(/^on/, ''), value);
    else if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, value);
  }
  node.append(...children.filter((c): c is Node | string => Boolean(c)));
  return node;
}
