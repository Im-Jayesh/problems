import { init as initAdmin } from '@instantdb/admin';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || '';

export const getAdminDb = () => {
  return initAdmin({
    appId: APP_ID,
    adminToken: process.env.INSTANT_APP_ADMIN_TOKEN || '',
  });
};
