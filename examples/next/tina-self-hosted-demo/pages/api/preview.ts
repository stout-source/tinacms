import type { NextApiRequest, NextApiResponse } from 'next';

type ResponseData = {
  message?: string;
  error?: string;
};

/**
 * Preview API endpoint for branch-aware content preview.
 *
 * Accepts a `branch` query parameter and optionally a `slug` parameter.
 * Sets the x-branch cookie to enable branch-specific content fetching,
 * then redirects to the preview page.
 *
 * Usage: /api/preview?branch=feature&slug=/posts/my-post
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  try {
    const { branch, slug = '/' } = req.query;

    // Validate branch parameter
    if (!branch || typeof branch !== 'string' || branch.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid branch parameter' });
    }

    // Sanitize branch name (basic validation)
    const sanitizedBranch = branch
      .replace(/[^a-zA-Z0-9._\-/]/g, '')
      .substring(0, 255);

    if (sanitizedBranch !== branch) {
      return res
        .status(400)
        .json({ error: 'Invalid branch name format' });
    }

    // Set the x-branch cookie to enable branch switching
    res.setHeader(
      'Set-Cookie',
      `x-branch=${encodeURIComponent(sanitizedBranch)}; Path=/; SameSite=Lax; Max-Age=3600`
    );

    // Redirect to preview page with the branch context
    const previewPath = `/preview?branch=${encodeURIComponent(sanitizedBranch)}${
      slug && slug !== '/' ? `&slug=${encodeURIComponent(String(slug))}` : ''
    }`;

    return res.redirect(307, previewPath);
  } catch (error) {
    console.error('Preview API error:', error);
    return res.status(500).json({ error: 'Failed to process preview request' });
  }
}
