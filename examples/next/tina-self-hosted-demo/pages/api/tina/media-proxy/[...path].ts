import { Octokit } from '@octokit/rest';
import { NextApiRequest, NextApiResponse } from 'next';

const octokit = new Octokit({
  auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
});

const owner = process.env.GITHUB_OWNER || 'stout-source';
const repo = process.env.GITHUB_REPO || 'tinacms';
const defaultBranch = process.env.GITHUB_BRANCH || 'main';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { path } = req.query;
  if (!path || Array.isArray(path) === false || path.length === 0) {
    res.status(400).json({ error: 'No path provided' });
    return;
  }

  const filePath = Array.isArray(path) ? path.join('/') : path;

  try {
    const { data, headers } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: defaultBranch,
    });

    if (Array.isArray(data)) {
      res.status(400).json({ error: 'Path is a directory' });
      return;
    }

    if (!('content' in data)) {
      res.status(400).json({ error: 'Unable to read file content' });
      return;
    }

    // Decode base64 content from GitHub API
    const fileContent = Buffer.from(data.content, 'base64');

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('ETag', data.sha);

    res.status(200).send(fileContent);
  } catch (error: any) {
    if (error.status === 404) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    if (error.status === 403) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    console.error('Media proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default handler;
