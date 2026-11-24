import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { createGitHubClient } from '../services/github/index.js';
import { repoParamsSchema, branchParamsSchema } from '../validators/github.js';
import { validate } from '../validators/validate.js';

export const githubRouter = express.Router();

githubRouter.use(requireAdmin);

githubRouter.get('/repos', async (req, res, next) => {
  try {
    const client = createGitHubClient({
      getDecryptedToken: () => req.user.getDecryptedToken(),
    });
    const repos = await client.listRepos();
    res.json({
      repos: repos.map(r => ({
        id: r.id,
        full_name: r.full_name,
        name: r.name,
        private: r.private,
        html_url: r.html_url,
        clone_url: r.clone_url,
        default_branch: r.default_branch,
        updated_at: r.updated_at,
      })),
    });
  } catch (error) {
    if (error.status === 401) {
      return res.status(401).json({
        error: { code: 'GITHUB_TOKEN_EXPIRED', message: 'GitHub token expired or invalid' },
      });
    }
    next(error);
  }
});

githubRouter.get('/repos/:owner/:repo/branches', validate(repoParamsSchema), async (req, res, next) => {
  try {
    const { owner, repo } = req.params;
    const client = createGitHubClient({
      getDecryptedToken: () => req.user.getDecryptedToken(),
    });
    const branches = await client.listBranches(owner, repo);
    res.json({
      branches: branches.map(b => ({
        name: b.name,
        commit: b.commit.sha,
        protected: b.protected,
      })),
    });
  } catch (error) {
    if (error.status === 401) {
      return res.status(401).json({
        error: { code: 'GITHUB_TOKEN_EXPIRED', message: 'GitHub token expired or invalid' },
      });
    }
    if (error.status === 404) {
      return res.status(404).json({
        error: { code: 'REPO_NOT_FOUND', message: 'Repository not found' },
      });
    }
    next(error);
  }
});

githubRouter.get('/repos/:owner/:repo/commits/:branch', validate(branchParamsSchema), async (req, res, next) => {
  try {
    const { owner, repo, branch } = req.params;
    const client = createGitHubClient({
      getDecryptedToken: () => req.user.getDecryptedToken(),
    });
    const commits = await client.listCommits(owner, repo, branch, 1);
    if (!commits || commits.length === 0) {
      return res.status(404).json({
        error: { code: 'NO_COMMITS', message: 'No commits found for branch' },
      });
    }
    const commit = commits[0];
    res.json({
      commit: {
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: commit.commit.author.date,
        },
        url: commit.html_url,
      },
    });
  } catch (error) {
    if (error.status === 401) {
      return res.status(401).json({
        error: { code: 'GITHUB_TOKEN_EXPIRED', message: 'GitHub token expired or invalid' },
      });
    }
    if (error.status === 404) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Repository, branch, or commit not found' },
      });
    }
    next(error);
  }
});