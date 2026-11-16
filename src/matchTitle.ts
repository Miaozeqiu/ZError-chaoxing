export const normalizeTitle = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '').toLowerCase()

export function matchTitles<T extends { title: string }>(items: T[], text: string) {
  const query = normalizeTitle(text)
  if (!query) return items
  const exact = items.filter(item => normalizeTitle(item.title) === query)
  return exact.length ? exact : items.filter(item => normalizeTitle(item.title).includes(query))
}
