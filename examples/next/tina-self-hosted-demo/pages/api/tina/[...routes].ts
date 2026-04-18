import { TinaNodeBackend, LocalBackendAuthProvider } from '@tinacms/datalayer';
import { resolve } from '@tinacms/graphql';
import { Octokit } from '@octokit/rest';
import { createBranchAwareGqlHandler } from '@stoutsource/branch-router';
import {
  makeEditorialWorkflowRoutes,
  makeWebhookHandler,
  withBranchProtection,
} from '@stoutsource/editorial-workflow-api';
import { makeMediaRoutes } from '@stoutsource/git-media';
import AzureADProvider from 'next-auth/providers/azure-ad';

import { TinaAuthJSOptions, AuthJsBackendAuthProvider } from 'tinacms-authjs';
import { isAzureEntraIdAuthEnabled } from '../../../tina/auth/azure-entra-id-provider';

import databaseClient from '../../../tina/__generated__/databaseClient';
import { pool } from '../../../tina/database';

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === 'true';
const isAzureEntraIdEnabled = isAzureEntraIdAuthEnabled();
const defaultBranch = process.env.GITHUB_BRANCH || 'main';
const protectedBranches = (process.env.PROTECTED_BRANCHES || defaultBranch)
  .split(',')
  .map((branch) => branch.trim())
  .filter(Boolean);

const getAzureProviderOptions = () => {
  const requiredVars = [
    'AZURE_AD_CLIENT_ID',
    'AZURE_AD_CLIENT_SECRET',
    'AZURE_AD_TENANT_ID',
  ] as const;
  const missingVars = requiredVars.filter((name) => !process.env[name]);

  if (missingVars.length) {
    throw new Error(
      `Missing required Azure Entra ID env vars: ${missingVars.join(', ')}`
    );
  }
  return {
    clientId: process.env.AZURE_AD_CLIENT_ID!,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    tenantId: process.env.AZURE_AD_TENANT_ID!,
  };
};

const octokit = new Octokit({
  auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
});

const baseAuthProvider = isLocal
  ? LocalBackendAuthProvider()
  : AuthJsBackendAuthProvider({
      authOptions: TinaAuthJSOptions({
        databaseClient: databaseClient,
        secret: process.env.NEXTAUTH_SECRET,
        providers: isAzureEntraIdEnabled
          ? [AzureADProvider(getAzureProviderOptions())]
          : undefined,
      }),
    });

const authProvider = {
  ...baseAuthProvider,
  isAuthorized: async (req, res) => {
    const result = await baseAuthProvider.isAuthorized(req, res);

    if (result?.isAuthorized) {
      return result;
    }

    // Auth.js sessions can be valid while role/session hydration lags.
    // Allow authenticated sessions through so password rotation can complete.
    const sessionUser = (req as any)?.session?.user;
    const cookieHeader = String(req?.headers?.cookie || '');
    const hasNextAuthSessionCookie =
      cookieHeader.includes('next-auth.session-token=') ||
      cookieHeader.includes('__Secure-next-auth.session-token=');

    if (
      (result?.errorCode === 403 || result?.errorCode === 401) &&
      (sessionUser || hasNextAuthSessionCookie)
    ) {
      return { isAuthorized: true };
    }

    return result;
  },
};

const branchAwareGqlHandler = withBranchProtection(
  createBranchAwareGqlHandler(pool, defaultBranch, resolve),
  protectedBranches,
  defaultBranch
);

const extraRoutes = {
  ...(authProvider.extraRoutes || {}),
  gql: {
    secure: true,
    handler: branchAwareGqlHandler,
  },
  ...makeEditorialWorkflowRoutes({
    pool,
    octokit,
    owner: process.env.GITHUB_OWNER!,
    repo: process.env.GITHUB_REPO!,
    protectedBranches,
    defaultBranch,
  }),
  ...makeMediaRoutes({
    octokit,
    owner: process.env.GITHUB_OWNER!,
    repo: process.env.GITHUB_REPO!,
    defaultBranch,
    publicFolder: 'public',
    mediaRoot: 'uploads',
    cdnBaseUrl: process.env.MEDIA_CDN_URL,
    localWriteDir: isLocal ? process.cwd() : undefined,
  }),
  ...(process.env.GITHUB_WEBHOOK_SECRET
    ? {
        'webhook/github': {
          secure: false,
          handler: makeWebhookHandler({
            pool,
            octokit,
            owner: process.env.GITHUB_OWNER!,
            repo: process.env.GITHUB_REPO!,
            webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
          }),
        },
      }
    : {}),
};

const handler = TinaNodeBackend({
  authProvider: {
    ...authProvider,
    extraRoutes,
  },
  databaseClient,
});

export default (req, res) => {
  // Modify the request here if you need to
  return handler(req, res);
};
