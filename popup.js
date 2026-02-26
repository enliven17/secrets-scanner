document.addEventListener('DOMContentLoaded', () => {
  const targetUrlInput = document.getElementById('target-url');
  const searchKeywordInput = document.getElementById('search-keyword');
  const scanRepoBtn = document.getElementById('scan-repo-btn');
  const searchRepoBtn = document.getElementById('search-repo-btn');
  const searchGlobalBtn = document.getElementById('search-global-btn');
  const resultsDiv = document.getElementById('results');
  const scanOldCommitsCheckbox = document.getElementById('scan-old-commits');
  const excludeExamplesCheckbox = document.getElementById('exclude-examples');

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

  const filterSection = document.getElementById('filter-section');
  const filterInput = document.getElementById('filter-input');

  function parseTargetFromUrl(url) {
    if (!url) return null;
    let urlStr = url;
    if (!urlStr.startsWith('http')) {
      urlStr = 'https://' + urlStr;
    }
    try {
      let urlObj = new URL(urlStr);
      if (urlObj.hostname === 'github.com') {
        let parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length === 1) {
          return { type: 'user', name: parts[0] };
        } else if (parts.length >= 2) {
          return { type: 'repo', name: `${parts[0]}/${parts[1]}` };
        }
      }
    } catch (e) {
      let parts = url.split('/').filter(Boolean);
      if (parts.length === 1) return { type: 'user', name: parts[0] };
      if (parts.length >= 2) return { type: 'repo', name: `${parts[0]}/${parts[1]}` };
    }
    return null;
  }

  function showProgress(msg) {
    filterSection.classList.add('hidden');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `<span style="color: var(--text-muted);">${msg}</span>`;
  }

  function renderError(msg) {
    filterSection.classList.add('hidden');
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
    if (excludeExamplesCheckbox && excludeExamplesCheckbox.checked && items) {
      let originalLength = items.length;
      items = items.filter(item => {
        let name = item.name.toLowerCase();
        let path = (item.path || '').toLowerCase();
        let fullKey = name + " " + path;

        // Ignore common illustrative file extensions and readmes
        if (fullKey.includes('example') ||
          fullKey.includes('sample') ||
          fullKey.includes('template') ||
          fullKey.includes('readme.md') ||
          fullKey.includes('readme.txt')) {
          return false;
        }
        return true;
      });
      totalCount = totalCount - (originalLength - items.length);
    }

    resultsDiv.classList.remove('hidden');
    if (!items || items.length === 0) {
      filterSection.classList.add('hidden');
      resultsDiv.innerHTML = `<span class="success">No exposures found for ${label}</span>`;
      return;
    }

    filterSection.classList.remove('hidden');
    filterInput.value = ''; // Reset filter

    let html = `<strong style="color: var(--text-main);">Found ${totalCount} results:</strong><br/>`;
    items.forEach(item => {
      html += `
          <div class="result-item" data-text="${(item.name + ' ' + item.repository.full_name).toLowerCase()}">
            File: <a href="${item.html_url}" target="_blank">${item.name}</a><br>
            Repo: <a href="${item.repository.html_url}" target="_blank">${item.repository.full_name}</a>
          </div>
        `;
    });

    resultsDiv.innerHTML = html;
  }

  // Live filter event listener
  filterInput?.addEventListener('input', (e) => {
    let term = e.target.value.toLowerCase();
    let resultItems = resultsDiv.querySelectorAll('.result-item');
    resultItems.forEach(item => {
      if (item.getAttribute('data-text').includes(term)) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  });

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
    let target = parseTargetFromUrl(targetUrlInput.value);
    if (!target) {
      renderError("Please enter a valid GitHub repository or user URL.");
      return;
    }

    let searchScope = target.type === 'user' ? `user:${target.name}` : `repo:${target.name}`;

    if (scanOldCommitsCheckbox && scanOldCommitsCheckbox.checked) {
      if (target.type === 'user') {
        renderError("Old Commits scanning is only supported for single repositories, not users.");
        return;
      }
      return scanOldCommitsLogic(target.name);
    }

    // Predefined queries to look for secrets
    let queries = [
      // Environment & System Configs
      `filename:.env ${searchScope}`,
      `filename:id_rsa ${searchScope}`,
      `filename:id_ed25519 ${searchScope}`,
      `filename:credentials ${searchScope}`,
      `filename:wp-config.php ${searchScope}`,
      `filename:database.yml ${searchScope}`,
      `"mongodb+srv://" ${searchScope}`,     // MongoDB URLs
      `"postgres://" ${searchScope}`,        // PostgreSQL URLs
      `"DATABASE_URL=" ${searchScope}`,      // General DB URL
      `"DB_PASSWORD=" ${searchScope}`,

      // Cloud & SaaS APIs
      `"AKIA" ${searchScope}`,               // AWS Access Key ID
      `"sk_live_" ${searchScope}`,           // Stripe Live Secret Key
      `"ghp_" ${searchScope}`,               // GitHub Personal Access Token
      `"xoxb-" ${searchScope}`,              // Slack Bot Token
      `"xoxp-" ${searchScope}`,              // Slack User Token
      `"NPM_TOKEN=" ${searchScope}`,
      `"DISCORD_BOT_TOKEN=" ${searchScope}`,
      `"TELEGRAM_BOT_TOKEN=" ${searchScope}`,
      `"SENDGRID_API_KEY=" ${searchScope}`,

      // Private Key Identifiers
      `"BEGIN PRIVATE KEY" ${searchScope}`,
      `"BEGIN RSA PRIVATE KEY" ${searchScope}`,
      `"PRIVATE_KEY=" ${searchScope}`,
      `"SECRET_KEY=" ${searchScope}`,
      `"_KEY=" ${searchScope}`,
      `"_SECRET=" ${searchScope}`,

      // Crypto/Web3 Specific (Files)
      `filename:wallet.dat ${searchScope}`,  // Bitcoin Core Wallet
      `filename:keystore ${searchScope}`,    // Ethereum Keystore

      // Crypto/Web3 Specific (Mnemonics & Keys)
      `"mnemonic" ${searchScope}`,
      `"seed phrase" ${searchScope}`,
      `"bip39" ${searchScope}`,
      `"12 words" ${searchScope}`,
      `"24 words" ${searchScope}`,
      `"xprv" ${searchScope}`,               // Extended Private Key
      `"yprv" ${searchScope}`,               // BIP49 Extended Private Key
      `"zprv" ${searchScope}`,               // BIP84 Extended Private Key
      `"WIF" ${searchScope}`,                // Wallet Import Format (Bitcoin)
      `"ETH_PRIVATE_KEY=" ${searchScope}`,
      `"SOLANA_PRIVATE_KEY=" ${searchScope}`,
      `"POLYGON_PRIVATE_KEY=" ${searchScope}`,
      `"BSC_PRIVATE_KEY=" ${searchScope}`,
      `"AVALANCHE_PRIVATE_KEY=" ${searchScope}`,
      `"ARBITRUM_PRIVATE_KEY=" ${searchScope}`,
      `"OPTIMISM_PRIVATE_KEY=" ${searchScope}`,
      `"SUI_PRIVATE_KEY=" ${searchScope}`,
      `"APTOS_PRIVATE_KEY=" ${searchScope}`,
      `"NEAR_PRIVATE_KEY=" ${searchScope}`,
      `"TON_PRIVATE_KEY=" ${searchScope}`,
      `"wallet_private_key" ${searchScope}`,
      `"keystore_password" ${searchScope}`,
      `"PASSPHRASE=" ${searchScope}`,

      // Public Keys / Wallet Addresses
      `"publicKey" ${searchScope}`,
      `"public_key" ${searchScope}`,
      `"walletAddress" ${searchScope}`,
      `"wallet_address" ${searchScope}`,
      `"0x" ${searchScope}`,                 // Generic Ethereum/EVM start
      `"bc1" ${searchScope}`,                // Bitcoin SegWit start

      // Web3 Providers & Infrastructure
      `"ALCHEMY_API_KEY=" ${searchScope}`,
      `"INFURA_API_KEY=" ${searchScope}`,
      `"MORALIS_API_KEY=" ${searchScope}`,
      `"ETHERSCAN_API_KEY=" ${searchScope}`,
      `"BSCSCAN_API_KEY=" ${searchScope}`
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
        /[A-Z0-9_]+_KEY\s*=\s*['"]?[a-zA-Z0-9\-\_]{16,}['"]?/, // Any _KEY= variables
        /[A-Z0-9_]+_SECRET\s*=\s*['"]?[a-zA-Z0-9\-\_]{16,}['"]?/, // Any _SECRET= variables
        /xprv[a-km-zA-HJ-NP-Z1-9]{100,}/,
        /yprv[a-km-zA-HJ-NP-Z1-9]{100,}/,
        /zprv[a-km-zA-HJ-NP-Z1-9]{100,}/,
        /("[a-z]+(\s+[a-z]+){11}")/, // 12-word basic regex
        /("[a-z]+(\s+[a-z]+){23}")/, // 24-word basic regex
        // Wallet Addresses / Public Keys
        /0x[a-fA-F0-9]{40}/, // EVM Addresses (Ethereum, Binance, Polygon, etc.)
        /bc1[a-zA-HJ-NP-Z0-9]{39,59}/, // Bitcoin Native SegWit
        /[13][a-km-zA-HJ-NP-Z1-9]{25,34}/, // Bitcoin Legacy / P2SH
        /(publicKey|wallet|address|pubKey)['"\s]*[:=]['"\s]*[1-9A-HJ-NP-Za-km-z]{32,44}['"]?/i // Solana & Base58 Addresses context-aware
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
    let target = parseTargetFromUrl(targetUrlInput.value);
    if (!target) {
      renderError("Please enter a valid GitHub repository or user URL.");
      return;
    }
    let keyword = searchKeywordInput.value.trim();
    if (!keyword) {
      renderError("Please enter a search keyword.");
      return;
    }

    showProgress('Searching target...');
    let searchScope = target.type === 'user' ? `user:${target.name}` : `repo:${target.name}`;

    try {
      let data = await githubSearchCode(`${keyword} ${searchScope}`);
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
