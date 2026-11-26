"use client";
import { init } from '@instantdb/react';
import { schema } from '../instant.schema';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || '';

if (!APP_ID && typeof window !== 'undefined') {
  console.warn('[db] NEXT_PUBLIC_INSTANT_APP_ID is not configured.');
}

export const db = init({ appId: APP_ID, schema });
