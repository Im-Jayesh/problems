import { init as initAdmin } from '@instantdb/admin';

export const getAdminDb = () => {
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID;
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN;

  if (!appId || !adminToken) {
    throw new Error(
      'Missing InstantDB configuration: NEXT_PUBLIC_INSTANT_APP_ID and INSTANT_APP_ADMIN_TOKEN are required.'
    );
  }

  return initAdmin({
    appId,
    adminToken,
  });
};
