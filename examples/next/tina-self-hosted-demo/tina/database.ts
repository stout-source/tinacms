import { createDatabase, createLocalDatabase } from '@tinacms/datalayer';
import { DatabasePool } from '@stoutsource/branch-router';
import { MongodbLevel } from 'mongodb-level';
import { GitHubProvider } from 'tinacms-gitprovider-github';

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === 'true';
const defaultBranch = process.env.GITHUB_BRANCH || 'main';

const createDatabaseAdapter = () =>
  new MongodbLevel<string, Record<string, any>>({
    collectionName: 'tinacms',
    dbName: 'tinacms',
    mongoUri: process.env.MONGODB_URI,
  });

export const pool = new DatabasePool({
  createDatabase,
  gitProviderConfig: {
    branch: defaultBranch,
    owner: process.env.GITHUB_OWNER!,
    repo: process.env.GITHUB_REPO!,
    token: process.env.GITHUB_PERSONAL_ACCESS_TOKEN!,
  },
  databaseAdapter: createDatabaseAdapter(),
});

export default isLocal
  ? createLocalDatabase()
  : createDatabase({
      gitProvider: new GitHubProvider({
        branch: defaultBranch,
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        token: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      }),
      databaseAdapter: createDatabaseAdapter(),
      namespace: defaultBranch,
    });
