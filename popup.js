document.addEventListener('DOMContentLoaded', () => {
  const targetUrlInput = document.getElementById('target-url');
  const searchKeywordInput = document.getElementById('search-keyword');
  const scanRepoBtn = document.getElementById('scan-repo-btn');
  const searchRepoBtn = document.getElementById('search-repo-btn');
  const searchGlobalBtn = document.getElementById('search-global-btn');
  const resultsDiv = document.getElementById('results');
  const scanOldCommitsCheckbox = document.getElementById('scan-old-commits');

  const settingsSection = document.getElementById('settings-section');
  const mainSection = document.getElementById('main-section');
  const githubTokenInput = document.getElementById('github-token');
  const openSettingsLnk = document.getElementById('open-settings');
  const saveTokenBtn = document.getElementById('save-token');
  const closeSettingsBtn = document.getElementById('close-settings');

  // Load existing token
  chrome.storage.local.get(['githubToken'], function (result) {
    if (result.githubToken) {
      githubTokenInput.value = result.githubToken;
    }
  });

  openSettingsLnk.addEventListener('click', (e) => {
    e.preventDefault();
    mainSection.classList.add('hidden');
    settingsSection.classList.remove('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
  });

  saveTokenBtn.addEventListener('click', () => {
    chrome.storage.local.set({ githubToken: githubTokenInput.value }, () => {
      alert('Token saved!');
      settingsSection.classList.add('hidden');
      mainSection.classList.remove('hidden');
    });
  });

  // Pre-fill URL if we are on a GitHub page
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    let url = tabs[0].url;
    if (url && url.includes("github.com")) {
      targetUrlInput.value = url;
    }
  });

  function getRepoFromUrl(url) {
    try {
      let urlObj = new URL(url);
      if (urlObj.hostname === 'github.com') {
        let parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
          return `${parts[0]}/${parts[1]}`;
        }
      }
    } catch (e) { }
    return null;
  }

  function showProgress(msg) {
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `<span style="color: var(--text-muted);">${msg}</span>`;
  }

  function renderError(msg) {
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `<span class="error">${msg}</span>`;
  }

  async function githubSearchCode(query) {
    let headers = {
      'Accept': 'application/vnd.github.v3+json'
    };

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['githubToken'], async function (result) {
        if (!result.githubToken) {
          return reject(new Error('GitHub PAT is required. Please set it in Settings.'));
        }
        headers['Authorization'] = `token ${result.githubToken}`;

        try {
          let response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=30`, {
            headers: headers
          });

          if (!response.ok) {
            let err = await response.json();
            throw new Error(err.message || 'API request failed');
          }

          let data = await response.json();
          resolve(data);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  function displayResults(items, totalCount, label) {
    resultsDiv.classList.remove('hidden');
    if (!items || items.length === 0) {
      resultsDiv.innerHTML = `<span class="success">No exposures found for ${label}</span>`;
      return;
    }

    let html = `<strong style="color: var(--text-main);">Found ${totalCount} results:</strong><br/>`;
    items.slice(0, 50).forEach(item => {
      html += `
          <div class="result-item">
            File: <a href="${item.html_url}" target="_blank">${item.name}</a><br>
            Repo: <a href="${item.repository.html_url}" target="_blank">${item.repository.full_name}</a>
          </div>
        `;
    });
    if (items.length > 50) {
      html += `<div class="result-item">...and more.</div>`
    }
    resultsDiv.innerHTML = html;
  }

  async function fetchRepoCommits(repo) {
    let headers = { 'Accept': 'application/vnd.github.v3+json' };
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['githubToken'], async function (result) {
        if (!result.githubToken) {
          return reject(new Error('GitHub PAT is required to scan old commits.'));
        }
        headers['Authorization'] = `token ${result.githubToken}`;
        try {
          let req = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=100`, { headers });
          if (!req.ok) throw new Error((await req.json()).message || 'Failed to fetch commits');
          resolve(await req.json());
        } catch (e) { reject(e); }
      });
    });
  }

  async function fetchCommitDetails(repo, sha) {
    let headers = { 'Accept': 'application/vnd.github.v3+json' };
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['githubToken'], async function (result) {
        if (result.githubToken) headers['Authorization'] = `token ${result.githubToken}`;
        try {
          let req = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, { headers });
          if (!req.ok) resolve(null); // Ignore single failures
          else resolve(await req.json());
        } catch (e) { resolve(null); }
      });
    });
  }

  scanRepoBtn.addEventListener('click', async () => {
    let repo = getRepoFromUrl(targetUrlInput.value);
    if (!repo) {
      renderError("Please enter a valid GitHub repository URL.");
      return;
    }

    if (scanOldCommitsCheckbox && scanOldCommitsCheckbox.checked) {
      return scanOldCommitsLogic(repo);
    }

    // Predefined queries to look for secrets
    let queries = [
      // Environment & System Configs
      `filename:.env repo:${repo}`,
      `filename:id_rsa repo:${repo}`,
      `filename:id_ed25519 repo:${repo}`,
      `filename:credentials repo:${repo}`,
      `filename:wp-config.php repo:${repo}`,
      `filename:database.yml repo:${repo}`,
      `"mongodb+srv://" repo:${repo}`,     // MongoDB URLs
      `"postgres://" repo:${repo}`,        // PostgreSQL URLs
      `"DATABASE_URL=" repo:${repo}`,      // General DB URL
      `"DB_PASSWORD=" repo:${repo}`,

      // Cloud & SaaS APIs
      `"AKIA" repo:${repo}`,               // AWS Access Key ID
      `"sk_live_" repo:${repo}`,           // Stripe Live Secret Key
      `"ghp_" repo:${repo}`,               // GitHub Personal Access Token
      `"xoxb-" repo:${repo}`,              // Slack Bot Token
      `"xoxp-" repo:${repo}`,              // Slack User Token
      `"NPM_TOKEN=" repo:${repo}`,
      `"DISCORD_BOT_TOKEN=" repo:${repo}`,
      `"TELEGRAM_BOT_TOKEN=" repo:${repo}`,
      `"SENDGRID_API_KEY=" repo:${repo}`,

      // Private Key Identifiers
      `"BEGIN PRIVATE KEY" repo:${repo}`,
      `"BEGIN RSA PRIVATE KEY" repo:${repo}`,
      `"PRIVATE_KEY=" repo:${repo}`,
      `"SECRET_KEY=" repo:${repo}`,

      // Crypto/Web3 Specific (Files)
      `filename:wallet.dat repo:${repo}`,  // Bitcoin Core Wallet
      `filename:keystore repo:${repo}`,    // Ethereum Keystore

      // Crypto/Web3 Specific (Mnemonics & Keys)
      `"mnemonic" repo:${repo}`,
      `"seed phrase" repo:${repo}`,
      `"bip39" repo:${repo}`,
      `"12 words" repo:${repo}`,
      `"24 words" repo:${repo}`,
      `"xprv" repo:${repo}`,               // Extended Private Key
      `"yprv" repo:${repo}`,               // BIP49 Extended Private Key
      `"zprv" repo:${repo}`,               // BIP84 Extended Private Key
      `"WIF" repo:${repo}`,                // Wallet Import Format (Bitcoin)
      `"ETH_PRIVATE_KEY=" repo:${repo}`,
      `"SOLANA_PRIVATE_KEY=" repo:${repo}`,
      `"wallet_private_key" repo:${repo}`,
      `"keystore_password" repo:${repo}`,
      `"PASSPHRASE=" repo:${repo}`,

      // Web3 Providers & Infrastructure
      `"ALCHEMY_API_KEY=" repo:${repo}`,
      `"INFURA_API_KEY=" repo:${repo}`,
      `"MORALIS_API_KEY=" repo:${repo}`,
      `"ETHERSCAN_API_KEY=" repo:${repo}`,
      `"BSCSCAN_API_KEY=" repo:${repo}`
    ];

    showProgress('Scanning multiple patterns (this might take a few seconds)...');

    let allItems = [];
    let hadAuthError = false;
    let authErrorMsg = "";

    try {
      for (let q of queries) {
        try {
          let data = await githubSearchCode(q);
          if (data && data.items) {
            allItems = allItems.concat(data.items);
          }
          // Delay slightly to avoid secondary rate limits
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          // Ignore individual query errors to allow others to finish
          console.error("Query failed: " + q, e);

          if (e.message.toLowerCase().includes('requir') || e.message.toLowerCase().includes('auth') || e.message.includes('PAT')) {
            hadAuthError = true;
            authErrorMsg = e.message;
            break;
          }
        }
      }

      if (hadAuthError) {
        renderError("Auth Error: " + authErrorMsg + " (Click Settings to add Token)");
        return;
      }

      // Deduplicate items by sha
      let uniqueItems = Array.from(new Map(allItems.map(item => [item.sha, item])).values());

      displayResults(uniqueItems, uniqueItems.length, "common secrets");
    } catch (e) {
      renderError("Error: " + e.message + ". Try adding a PAT in Settings if rate limited.");
    }
  });

  async function scanOldCommitsLogic(repo) {
    showProgress('Fetching recent 100 commits...');
    try {
      let commits = await fetchRepoCommits(repo);
      if (!commits || commits.length === 0) {
        displayResults([], 0, "past commits");
        return;
      }

      let suspiciousFiles = ['.env', 'id_rsa', 'id_ed25519', 'credentials', 'wp-config.php', 'database.yml', 'wallet.dat', 'keystore'];
      let secretRegexes = [
        /AKIA[0-9A-Z]{16}/,
        /BEGIN (RSA )?PRIVATE KEY/,
        /sk_live_[0-9a-zA-Z]{24,}/,
        /ghp_[0-9a-zA-Z]{36}/,
        /xox[bp]-[0-9a-zA-Z\-]+/,
        /mongodb\+srv:\/\//,
        /postgres:\/\/[^:]+:[^@]+@/,
        /PRIVATE_KEY\s*=\s*['"]?[a-zA-Z0-9]{32,}['"]?/,
        /SECRET_KEY\s*=\s*['"]?[a-zA-Z0-9]{32,}['"]?/,
        /xprv[a-km-zA-HJ-NP-Z1-9]{100,}/,
        /yprv[a-km-zA-HJ-NP-Z1-9]{100,}/,
        /zprv[a-km-zA-HJ-NP-Z1-9]{100,}/,
        /("[a-z]+(\s+[a-z]+){11}")/, // 12-word basic regex
        /("[a-z]+(\s+[a-z]+){23}")/  // 24-word basic regex
      ];

      let foundItems = [];

      for (let i = 0; i < commits.length; i++) {
        showProgress(`Scanning commit history... (${i + 1}/${commits.length})`);
        let detail = await fetchCommitDetails(repo, commits[i].sha);
        if (detail && detail.files) {
          for (let file of detail.files) {
            let filename = file.filename.split('/').pop().toLowerCase();
            let isSuspicious = suspiciousFiles.includes(filename);
            let hasTokens = false;

            if (file.patch) {
              for (let rx of secretRegexes) {
                if (rx.test(file.patch)) {
                  hasTokens = true;
                  break;
                }
              }
            }

            if (isSuspicious || hasTokens) {
              foundItems.push({
                name: file.filename + ` (Commit: ${detail.sha.substring(0, 7)})`,
                html_url: detail.html_url,
                repository: { full_name: repo, html_url: `https://github.com/${repo}` },
                sha: `${detail.sha}-${file.filename}` // Unique dedup key
              });
            }
          }
        }
        // Minimal delay to prevent API secondary rate limits on looping details
        await new Promise(r => setTimeout(r, 200));
      }

      // Deduplicate items
      let uniqueItems = Array.from(new Map(foundItems.map(item => [item.sha, item])).values());
      displayResults(uniqueItems, uniqueItems.length, "past commits");

    } catch (e) {
      renderError("Old Commits Error: " + e.message);
    }
  }

  searchRepoBtn.addEventListener('click', async () => {
    let repo = getRepoFromUrl(targetUrlInput.value);
    if (!repo) {
      renderError("Please enter a valid GitHub repository URL.");
      return;
    }
    let keyword = searchKeywordInput.value.trim();
    if (!keyword) {
      renderError("Please enter a search keyword.");
      return;
    }

    showProgress('Searching repository...');
    try {
      let data = await githubSearchCode(`${keyword} repo:${repo}`);
      displayResults(data.items, data.total_count, `"${keyword}"`);
    } catch (e) {
      renderError("Error: " + e.message);
    }
  });

  searchGlobalBtn.addEventListener('click', async () => {
    let keyword = searchKeywordInput.value.trim();
    if (!keyword) {
      renderError("Please enter a search keyword.");
      return;
    }

    showProgress('Searching globally...');
    try {
      let data = await githubSearchCode(`${keyword}`);
      displayResults(data.items, data.total_count, `"${keyword}" globally`);
    } catch (e) {
      renderError("Error: " + e.message + " (Global search often requires auth, check Settings)");
    }
  });
});
