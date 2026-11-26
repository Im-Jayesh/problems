import type { InstantRules } from '@instantdb/react';

const rules = {
  clusters: {
    allow: {
      view: 'true',
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  problems: {
    allow: {
      view: 'true',
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  claims: {
    allow: {
      view: 'true',
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
} satisfies InstantRules;

export default rules;
