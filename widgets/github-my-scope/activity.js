;(function (root) {
const REPOSITORY_SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const safeRepo = (value) => typeof value === 'string'
  && value.split('/').length === 2
  && value.split('/').every((part) => part !== '.' && part !== '..')
  && REPOSITORY_SLUG.test(value)

/**
 * Order repositories from the authenticated user's contribution event feed.
 * Item update timestamps are not used: another person's comment can update an issue or PR.
 * @param {{ repoActivity?: Array<{repo?: unknown, updatedAt?: unknown}> }} snapshot
 * @param {unknown} requestedCount
 * @returns {Array<{repo: string, updatedAt: number}>}
 */
function recentRepos(snapshot, requestedCount) {
  const count = Number(requestedCount)
  const limit = Math.max(3, Math.min(10, Number.isFinite(count) && count > 0 ? Math.floor(count) : 5))
  const latest = new Map()
  const sections = [snapshot?.repoActivity]

  for (const items of sections) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!safeRepo(item?.repo)) continue
      const updatedAt = Number(item.updatedAt)
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) continue
      const key = item.repo.toLocaleLowerCase('en-US')
      const previous = latest.get(key)
      if (!previous || updatedAt > previous.updatedAt) latest.set(key, { repo: item.repo, updatedAt })
    }
  }

  return [...latest.values()].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, limit)
}

root.FremkitMyScope = { recentRepos }
})(globalThis)
