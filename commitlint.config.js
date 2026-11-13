// Commit messages follow Conventional Commits, checked on every commit by the
// commit-msg hook (simple-git-hooks, installed by `pnpm install`).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'docs',
        'test',
        'chore',
        'perf',
        'ci',
        'build',
        'style',
        'revert',
      ],
    ],
    // A warning, not an error: new areas get new scopes.
    'scope-enum': [
      1,
      'always',
      [
        'auth',
        'ui',
        'shell',
        'fixtures',
        'train',
        'puzzles',
        'openings',
        'db',
        'competitions',
        'deps',
      ],
    ],
    // The repository owner is the sole author of every commit.
    'trailer-exists': [2, 'never', 'Co-Authored-By:'],
    'header-max-length': [2, 'always', 100],
  },
}
