import { i } from '@instantdb/react';

export const schema = i.schema({
  entities: {
    clusters: i.entity({
      title: i.string(),          
      submissionCount: i.number(), 
      plusOneCount: i.number(),    
      totalWeight: i.number(),     
      centroid: i.string(),        // JSON-serialized string of the embedding vector
      createdAt: i.number(),
      updatedAt: i.number(),
      velocity: i.number(),        
      claimedByName: i.string().optional(),
      claimedByEmail: i.string().optional(),
      claimedByLink: i.string().optional(),
      claimedMessage: i.string().optional(),
      claimedAt: i.number().optional(),
      category: i.string().optional(),
    }),
    problems: i.entity({
      text: i.string(),
      createdAt: i.number(),
    }),
    claims: i.entity({
      name: i.string(),
      link: i.string(),
      message: i.string(),
      createdAt: i.number(),
    }),
  },
  links: {
    clusterProblems: {
      forward: {
        on: 'clusters',
        has: 'many',
        label: 'problems',
      },
      reverse: {
        on: 'problems',
        has: 'one',
        label: 'cluster',
      },
    },
    clusterClaims: {
      forward: {
        on: 'clusters',
        has: 'many',
        label: 'claims',
      },
      reverse: {
        on: 'claims',
        has: 'one',
        label: 'cluster',
      },
    },
  },
  rooms: {
    lobby: {
      presence: i.entity({
        active: i.boolean().optional(),
        lastActive: i.number().optional(),
      }),
    },
  },
});

export type AppSchema = typeof schema;
