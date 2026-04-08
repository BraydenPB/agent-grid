export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'terminals',
        'layout',
        'workspaces',
        'store',
        'backend',
        'ui',
        'config',
        'deps',
        'ci',
      ],
    ],
    'scope-empty': [1, 'never'],
  },
};
