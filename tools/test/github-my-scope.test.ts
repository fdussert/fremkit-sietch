import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

type ActivityRow = { repo: string; updatedAt: number }
type ActivitySnapshot = { notifications?: unknown[]; reviewRequests?: unknown[]; myPrs?: unknown[]; repoActivity?: unknown[] }
const activityContext: { FremkitMyScope?: { recentRepos: (snapshot: ActivitySnapshot, count: unknown) => ActivityRow[] } } = {}
runInNewContext(readFileSync(new URL('../../widgets/github-my-scope/activity.js', import.meta.url), 'utf8'), activityContext)
const recentRepos = activityContext.FremkitMyScope!.recentRepos

describe('GitHub My Scope repository activity', () => {
  it('orders repositories by the authenticated user activity feed, not item update times', () => {
    const rows = recentRepos({
      repoActivity: [
        { repo: 'livio/alpha', updatedAt: 200 },
        { repo: 'livio/beta', updatedAt: 500 },
      ],
      reviewRequests: [{ repo: 'livio/gamma', updatedAt: 900 }],
      myPrs: [{ repo: 'livio/alpha', updatedAt: 1000 }],
    }, 5)

    expect(rows).toEqual([
      { repo: 'livio/beta', updatedAt: 500 },
      { repo: 'livio/alpha', updatedAt: 200 },
    ])
  })

  it('deduplicates repositories by newest user event and ignores other users’ item updates', () => {
    const rows = recentRepos({
      repoActivity: [
        { repo: 'livio/alpha', updatedAt: 500 },
        { repo: 'livio/gamma', updatedAt: 400 },
        { repo: 'livio/beta', updatedAt: 300 },
      ],
      notifications: [{ repo: 'livio/alpha', updatedAt: 800 }],
      reviewRequests: [{ repo: 'livio/beta', updatedAt: 900 }],
      myPrs: [{ repo: 'livio/gamma', updatedAt: 1000 }],
    }, 5)

    expect(rows).toEqual([
      { repo: 'livio/alpha', updatedAt: 500 },
      { repo: 'livio/gamma', updatedAt: 400 },
      { repo: 'livio/beta', updatedAt: 300 },
    ])
  })

  it('ignores invalid slugs and clamps repository count to 3–10', () => {
    const repoActivity = Array.from({ length: 12 }, (_, index) => ({
      repo: index === 0 ? 'not/a/repository/slug' : `owner/repo-${index}`,
      updatedAt: 1000 - index,
    }))

    expect(recentRepos({ repoActivity }, 1)).toHaveLength(3)
    expect(recentRepos({ repoActivity }, 99)).toHaveLength(10)
    expect(recentRepos({ repoActivity }, 8)).toHaveLength(8)
    expect(recentRepos({ repoActivity: [{ repo: '../unsafe', updatedAt: 2000 }] }, 5)).toEqual([])
  })
})
