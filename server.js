const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// GitHub API Base URL
const GITHUB_API = 'https://api.github.com';

// Helper function for GitHub API calls
async function githubAPI(endpoint, method = 'GET', body = null, token) {
    try {
        const config = {
            method,
            url: `${GITHUB_API}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        };

        if (body) {
            config.data = body;
        }

        const response = await axios(config);
        return { success: true, data: response.data };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.message || error.message,
            status: error.response?.status
        };
    }
}

// Route: Verify token
app.post('/api/auth/verify', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    const result = await githubAPI('/user', 'GET', null, token);

    if (result.success) {
        res.json({
            success: true,
            user: {
                login: result.data.login,
                name: result.data.name,
                avatar_url: result.data.avatar_url,
                public_repos: result.data.public_repos,
                followers: result.data.followers
            }
        });
    } else {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Route: Get all repositories
app.post('/api/repos/list', async (req, res) => {
    const { token, page = 1, per_page = 30 } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    const result = await githubAPI(
        `/user/repos?page=${page}&per_page=${per_page}&sort=updated&affiliation=owner,collaborator`,
        'GET',
        null,
        token
    );

    if (result.success) {
        res.json({ success: true, repos: result.data });
    } else {
        res.status(result.status || 500).json({ error: result.error });
    }
});

// Route: Get repository details
app.post('/api/repos/:owner/:repo', async (req, res) => {
    const { token } = req.body;
    const { owner, repo } = req.params;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    const result = await githubAPI(`/repos/${owner}/${repo}`, 'GET', null, token);

    if (result.success) {
        res.json({ success: true, repo: result.data });
    } else {
        res.status(result.status || 500).json({ error: result.error });
    }
});

// Route: Create repository
app.post('/api/repos/create', async (req, res) => {
    const { token, name, description, private: isPrivate } = req.body;

    if (!token || !name) {
        return res.status(400).json({ error: 'Token and name are required' });
    }

    const body = {
        name,
        description: description || null,
        private: isPrivate || false,
        auto_init: true
    };

    const result = await githubAPI('/user/repos', 'POST', body, token);

    if (result.success) {
        res.json({ success: true, repo: result.data });
    } else {
        res.status(result.status || 500).json({ error: result.error });
    }
});

// Route: Update repository
app.put('/api/repos/:owner/:repo', async (req, res) => {
    const { token, name, description, private: isPrivate } = req.body;
    const { owner, repo } = req.params;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    const body = {};
    if (name) body.name = name;
    if (description !== undefined) body.description = description;
    if (isPrivate !== undefined) body.private = isPrivate;

    const result = await githubAPI(`/repos/${owner}/${repo}`, 'PATCH', body, token);

    if (result.success) {
        res.json({ success: true, repo: result.data });
    } else {
        res.status(result.status || 500).json({ error: result.error });
    }
});

// Route: Delete repository
app.delete('/api/repos/:owner/:repo', async (req, res) => {
    const { token } = req.body;
    const { owner, repo } = req.params;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    const result = await githubAPI(`/repos/${owner}/${repo}`, 'DELETE', null, token);

    if (result.success || result.status === 204) {
        res.json({ success: true });
    } else {
        res.status(result.status || 500).json({ error: result.error });
    }
});

// Route: Get repository languages
app.post('/api/repos/:owner/:repo/languages', async (req, res) => {
    const { token } = req.body;
    const { owner, repo } = req.params;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    const result = await githubAPI(`/repos/${owner}/${repo}/languages`, 'GET', null, token);

    if (result.success) {
        res.json({ success: true, languages: result.data });
    } else {
        res.status(result.status || 500).json({ error: result.error });
    }
});

// Route: Get repository topics
app.post('/api/repos/:owner/:repo/topics', async (req, res) => {
    const { token } = req.body;
    const { owner, repo } = req.params;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    const result = await githubAPI(`/repos/${owner}/${repo}/topics`, 'GET', null, token);

    if (result.success) {
        res.json({ success: true, topics: result.data });
    } else {
        res.status(result.status || 500).json({ error: result.error });
    }
});

// Route: Get repository stats
app.post('/api/repos/stats', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    // Get all repos first
    const reposResult = await githubAPI('/user/repos?per_page=100&affiliation=owner,collaborator', 'GET', null, token);

    if (!reposResult.success) {
        return res.status(reposResult.status || 500).json({ error: reposResult.error });
    }

    const repos = reposResult.data;

    const stats = {
        total: repos.length,
        public: repos.filter(r => !r.private).length,
        private: repos.filter(r => r.private).length,
        totalStars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
        totalForks: repos.reduce((sum, r) => sum + r.forks_count, 0),
        totalSize: repos.reduce((sum, r) => sum + r.size, 0),
        languages: [...new Set(repos.map(r => r.language).filter(Boolean))],
        mostStarred: repos.sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 5),
        recentlyUpdated: repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 5)
    };

    res.json({ success: true, stats });
});

// Route: Search repositories
app.post('/api/repos/search', async (req, res) => {
    const { token, query } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    // Note: Using user repos endpoint as GitHub search requires different endpoint
    const result = await githubAPI('/user/repos?per_page=100&affiliation=owner,collaborator', 'GET', null, token);

    if (result.success) {
        const filtered = result.data.filter(repo =>
            repo.name.toLowerCase().includes(query.toLowerCase()) ||
            (repo.description && repo.description.toLowerCase().includes(query.toLowerCase()))
        );
        res.json({ success: true, repos: filtered });
    } else {
        res.status(result.status || 500).json({ error: result.error });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ GitHub Manager Server running on http://localhost:${PORT}`);
    console.log(`📝 API endpoints:`);
    console.log(`   POST   /api/auth/verify`);
    console.log(`   POST   /api/repos/list`);
    console.log(`   POST   /api/repos/create`);
    console.log(`   POST   /api/repos/:owner/:repo`);
    console.log(`   PUT    /api/repos/:owner/:repo`);
    console.log(`   DELETE /api/repos/:owner/:repo`);
    console.log(`   POST   /api/repos/stats`);
    console.log(`   POST   /api/repos/search`);
});
