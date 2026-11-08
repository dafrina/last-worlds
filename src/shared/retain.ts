/**
 * Keeps the items `keep` accepts, in their order, in the same array (docs/38 PF4): `items = items.filter(keep)` without a
 * new array each simulation tick. `keep` sees each item once, in order, and must not change the array itself.
 */
export function retain<T>(items: T[], keep: (item: T) => unknown): void {
  const length = items.length;
  let kept = 0;
  for (let i = 0; i < length; i++) {
    const item = items[i];
    if (keep(item)) items[kept++] = item;
  }
  items.length = kept;
}
