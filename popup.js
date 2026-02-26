document.addEventListener('DOMContentLoaded', () => {
  const targetUrlInput = document.getElementById('target-url');
  const searchKeywordInput = document.getElementById('search-keyword');
  const scanRepoBtn = document.getElementById('scan-repo-btn');
  const searchRepoBtn = document.getElementById('search-repo-btn');
  const searchGlobalBtn = document.getElementById('search-global-btn');
  const resultsDiv = document.getElementById('results');
  const scanOldCommitsCheckbox = document.getElementById('scan-old-commits');
  const excludeExamplesCheckbox = document.getElementById('exclude-examples');
  const onlyEnvFilesCheckbox = document.getElementById('only-env-files');

  const settingsSection = document.getElementById('settings-section');
  const mainSection = document.getElementById('main-section');
  const githubTokenInput = document.getElementById('github-token');
  const openSettingsLnk = document.getElementById('open-settings');
  const saveTokenBtn = document.getElementById('save-token');
  const closeSettingsBtn = document.getElementById('close-settings');
  const clearIgnoredBtn = document.getElementById('clear-ignored-btn');

  let ignoredRepos = [];

  // Load existing token & ignored repos
  chrome.storage.local.get(['githubToken', 'ignoredRepos'], function (result) {
    if (result.githubToken) {
      githubTokenInput.value = result.githubToken;
    }
    if (result.ignoredRepos) {
      ignoredRepos = result.ignoredRepos;
    }
  });

  clearIgnoredBtn?.addEventListener('click', () => {
    ignoredRepos = [];
    chrome.storage.local.set({ ignoredRepos: [] }, () => {
      alert('All ignored repositories have been cleared!');
    });
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
      'Accept': 'application/vnd.github.v3.text-match+json'
    };

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['githubToken'], async function (result) {
        if (!result.githubToken) {
          return reject(new Error('GitHub PAT is required. Please set it in Settings.'));
        }
        headers['Authorization'] = `token ${result.githubToken}`;

        try {
          let response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=100`, {
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

  const evmRpcs = [
    { name: 'ETH', url: 'https://cloudflare-eth.com' },
    { name: 'BSC', url: 'https://bsc-dataseed.binance.org' },
    { name: 'Polygon', url: 'https://polygon-rpc.com' },
    { name: 'Arbitrum', url: 'https://arb1.arbitrum.io/rpc' },
    { name: 'Optimism', url: 'https://mainnet.optimism.io' }
  ];
  const solRpc = 'https://api.mainnet-beta.solana.com';

  function extractPotentialKeys(text) {
    if (!text) return [];
    let keys = [];
    const addUnique = (type, val) => {
      if (!keys.some(k => k.type === type && k.value === val)) keys.push({ type, value: val });
    };

    let evmPk = text.match(/\b([a-fA-F0-9]{64})\b/g);
    let evmPrefixPk = text.match(/\b(0x[a-fA-F0-9]{64})\b/g);
    let evmAddr = text.match(/\b(0x[a-fA-F0-9]{40})\b/g);
    let solBase58 = text.match(/\b([1-9A-HJ-NP-Za-km-z]{87,88})\b/g);
    let solArray = text.match(/\[\s*\d+\s*(?:,\s*\d+\s*){63}\]/g);
    let regexSolAddr = /(?:publicKey|walletAddress|address)['"\s:=]*([1-9A-HJ-NP-Za-km-z]{32,44})/gi;
    let btcAddr = text.match(/\b(bc1[a-zA-HJ-NP-Z0-9]{39,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g);
    let suiAptosAddr = text.match(/\b(0x[a-fA-F0-9]{64})\b/g);

    if (evmPk) evmPk.forEach(k => addUnique('EVM_PRIVATE_KEY', k));
    if (evmPrefixPk) evmPrefixPk.forEach(k => addUnique('EVM_PRIVATE_KEY', k.replace('0x', '')));
    if (evmAddr) evmAddr.forEach(k => addUnique('EVM_ADDRESS', k));
    if (solBase58) solBase58.forEach(k => addUnique('SOL_PRIVATE_KEY', k));
    if (solArray) solArray.forEach(k => addUnique('SOL_PRIVATE_KEY_ARRAY', k));
    if (btcAddr) btcAddr.forEach(k => addUnique('BTC_ADDRESS', k));
    if (suiAptosAddr) suiAptosAddr.forEach(k => addUnique('SUI_APTOS_ADDRESS', k));

    let m;
    while ((m = regexSolAddr.exec(text)) !== null) addUnique('SOL_ADDRESS', m[1]);
    return keys;
  }

  function getEvmAddressFromKey(hexPrivateKey) {
    if (!hexPrivateKey.startsWith('0x')) hexPrivateKey = '0x' + hexPrivateKey;
    try {
      const wallet = new ethers.Wallet(hexPrivateKey);
      return wallet.address;
    } catch (e) { return null; }
  }

  function getSolAddressFromKey(key) {
    try {
      let uintArray;
      if (key.startsWith('[')) {
        uintArray = new Uint8Array(JSON.parse(key));
      } else {
        uintArray = solanaWeb3.Keypair.fromSecretKey(ethers.utils.base58.decode(key)).secretKey;
      }
      const keypair = solanaWeb3.Keypair.fromSecretKey(uintArray);
      return keypair.publicKey.toString();
    } catch (e) { return null; }
  }

  async function getEvmBalance(address) {
    let balances = [];
    for (let rpc of evmRpcs) {
      try {
        let res = await fetch(rpc.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] })
        });
        let data = await res.json();
        let bal = (parseInt(data.result, 16) / 1e18).toFixed(4);
        if (parseFloat(bal) > 0) balances.push(`<span style="color:var(--success)">${rpc.name}: ${bal}</span>`);
      } catch (e) { }
    }
    return balances.length > 0 ? balances.join(' | ') : '0 Balance on all EVM networks';
  }

  async function getSolBalance(address) {
    try {
      let res = await fetch(solRpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] })
      });
      let data = await res.json();
      let bal = (data.result.value / 1e9).toFixed(4);
      let html = parseFloat(bal) > 0 ? `<span style="color:var(--success)">Solana: ${bal} SOL</span>` : `Solana: ${bal} SOL`;
      return html;
    } catch (e) { return 'Error checking SOL'; }
  }

  async function getSuiBalance(address) {
    try {
      let res = await fetch('https://fullnode.mainnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "suix_getBalance", params: [address] })
      });
      let data = await res.json();
      if (data.result && data.result.totalBalance) {
        let bal = (parseInt(data.result.totalBalance) / 1e9).toFixed(4);
        return parseFloat(bal) > 0 ? `<span style="color:var(--success)">Sui: ${bal} SUI</span>` : `Sui: ${bal} SUI`;
      }
    } catch (e) { }
    return 'Sui: 0.0000 SUI';
  }

  async function getAptosBalance(address) {
    try {
      let res = await fetch(`https://fullnode.mainnet.aptoslabs.com/v1/accounts/${address}/resource/0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>`);
      let data = await res.json();
      if (data.data && data.data.coin && data.data.coin.value) {
        let bal = (parseInt(data.data.coin.value) / 1e8).toFixed(4);
        return parseFloat(bal) > 0 ? `<span style="color:var(--success)">Aptos: ${bal} APT</span>` : `Aptos: ${bal} APT`;
      }
    } catch (e) { }
    return 'Aptos: 0.0000 APT';
  }

  async function getBtcBalance(address) {
    try {
      let res = await fetch(`https://blockchain.info/q/addressbalance/${address}`);
      if (res.ok) {
        let balStr = await res.text();
        let bal = (parseInt(balStr) / 1e8).toFixed(6);
        if (!isNaN(bal)) {
          return parseFloat(bal) > 0 ? `<span style="color:var(--success)">Bitcoin: ${bal} BTC</span>` : `Bitcoin: ${bal} BTC`;
        }
      }
    } catch (e) { }
    return 'Bitcoin: 0.000000 BTC';
  }

  function displayResults(items, totalCount, label) {
    if (items && items.length > 0) {
      let filteredItems = items.filter(item => !ignoredRepos.includes(item.repository.full_name));
      // Adjust total count loosely based on filter difference
      totalCount = totalCount - (items.length - filteredItems.length);
      items = filteredItems;
    }

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

    // Create an object to store matches globally for buttons
    window.extractedKeyItems = {};

    let itemsToDisplay = items.slice(0, 300);

    itemsToDisplay.forEach((item, index) => {
      // Find potential keys in text_matches (from Search API) or patch (from Commits API)
      let fullText = item.patch || "";
      if (item.text_matches) {
        fullText += item.text_matches.map(m => m.fragment).join('\n');
      }
      let foundKeys = extractPotentialKeys(fullText);

      window.extractedKeyItems[index] = foundKeys;

      html += `
          <div class="result-item" data-text="${(item.name + ' ' + item.repository.full_name).toLowerCase()}">
            <div style="flex:1;">
              File: <a href="${item.html_url}" target="_blank">${item.name}</a><br>
              Repo: <a href="${item.repository.html_url}" target="_blank">${item.repository.full_name}</a>
            </div>
            ${foundKeys.length > 0 ? `
              <div style="margin-top: 8px;">
                <button class="btn-secondary check-balance-evt" data-index="${index}" style="padding: 6px; font-size: 11px; margin-bottom: 0;">
                  Check Balance (${foundKeys.length} items)
                </button>
                <div id="balance-res-${index}" class="hidden" style="margin-top: 6px; padding: 8px; font-size: 11px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; border-left: 2px solid var(--primary);"></div>
              </div>` : ''}
            <div style="margin-top: 6px;">
              <button class="btn-secondary ignore-repo-evt" data-repo="${item.repository.full_name}" style="padding: 6px; font-size: 11px; margin-bottom: 0; color: var(--text-muted); border-color: transparent;">
                ✓ Mark Repo as Safe (Hide)
              </button>
            </div>
          </div>
        `;
    });

    if (items.length > 300) {
      html += `<div class="result-item" style="text-align:center; color: var(--text-muted); font-size: 11px; padding: 12px;">+${items.length - 300} more results hidden to prevent UI lag. Fast filtering keeps them in memory.</div>`;
    }

    resultsDiv.innerHTML = html;
  }

  // Handle Dynamic Balance Checking
  resultsDiv.addEventListener('click', async (e) => {
    if (e.target.classList.contains('check-balance-evt')) {
      let btn = e.target;
      let idx = btn.getAttribute('data-index');
      let resDiv = document.getElementById(`balance-res-${idx}`);
      let keys = window.extractedKeyItems[idx];

      btn.innerText = "Checking...";
      btn.disabled = true;
      resDiv.classList.remove('hidden');
      resDiv.innerHTML = 'Connecting to RPCs...';

      let resultsHtml = '';
      for (let k of keys) {
        try {
          if (k.type.includes('EVM')) {
            let addr = k.type === 'EVM_ADDRESS' ? k.value : getEvmAddressFromKey(k.value);
            if (addr) {
              let bal = await getEvmBalance(addr);
              resultsHtml += `<div style="margin-bottom: 2px;"><strong>EVM Addr (${addr.substring(0, 6)}...):</strong> ${bal}</div>`;
            }
          } else if (k.type.includes('SOL')) {
            let addr = k.type === 'SOL_ADDRESS' ? k.value : getSolAddressFromKey(k.value);
            if (addr) {
              let bal = await getSolBalance(addr);
              resultsHtml += `<div style="margin-bottom: 2px;"><strong>SOL Addr (${addr.substring(0, 6)}...):</strong> ${bal}</div>`;
            }
          } else if (k.type === 'BTC_ADDRESS') {
            let bal = await getBtcBalance(k.value);
            resultsHtml += `<div style="margin-bottom: 2px;"><strong>BTC Addr (${k.value.substring(0, 6)}...):</strong> ${bal}</div>`;
          } else if (k.type === 'SUI_APTOS_ADDRESS') {
            let suiBal = await getSuiBalance(k.value);
            let aptBal = await getAptosBalance(k.value);
            resultsHtml += `<div style="margin-bottom: 2px;"><strong>SUI/APT Addr (${k.value.substring(0, 6)}...):</strong> ${suiBal} | ${aptBal}</div>`;
          }
        } catch (e) {
          console.error('Error fetching balance:', e);
        }
      }

      if (!resultsHtml) resultsHtml = 'Could not derive target address or network.';
      resDiv.innerHTML = resultsHtml;
      btn.innerText = "Checked";
    }

    // Handle Ignoring Repo
    if (e.target.classList.contains('ignore-repo-evt')) {
      let repoName = e.target.getAttribute('data-repo');

      if (!ignoredRepos.includes(repoName)) {
        ignoredRepos.push(repoName);
        chrome.storage.local.set({ ignoredRepos });
      }

      // Hide all results from this repo currently on screen
      let uiItems = resultsDiv.querySelectorAll('.result-item');
      uiItems.forEach(ui => {
        if (ui.getAttribute('data-text').includes(repoName.toLowerCase())) {
          ui.style.display = 'none';
        }
      });
    }
  });

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

    if (onlyEnvFilesCheckbox && onlyEnvFilesCheckbox.checked) {
      queries = queries.map(q => {
        if (q.includes('filename:') && !q.includes('filename:.env')) {
          return null; // id_rsa, wp-config etc. will be dropped
        }
        if (!q.includes('filename:')) {
          return `${q} filename:.env`;
        }
        return q;
      }).filter(Boolean);
    }

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

  async function scanOldCommitsLogic(repo, customKeyword = null) {
    showProgress('Fetching recent 100 commits...');
    try {
      let commits = await fetchRepoCommits(repo);
      if (!commits || commits.length === 0) {
        displayResults([], 0, "past commits");
        return;
      }

      let suspiciousFiles = ['.env', 'id_rsa', 'id_ed25519', 'credentials', 'wp-config.php', 'database.yml', 'wallet.dat', 'keystore'];

      let secretRegexes = [];
      if (customKeyword) {
        // If a custom Custom Search keyword is provided
        secretRegexes = [new RegExp(customKeyword, 'i')];
        suspiciousFiles = []; // only focus on the matching content pattern for custom search
      } else {
        secretRegexes = [
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
      }

      let foundItems = [];

      for (let i = 0; i < commits.length; i++) {
        showProgress(`Scanning commit history... (${i + 1}/${commits.length})`);
        let detail = await fetchCommitDetails(repo, commits[i].sha);
        if (detail && detail.files) {
          for (let file of detail.files) {
            let filename = file.filename.split('/').pop().toLowerCase();

            if (onlyEnvFilesCheckbox && onlyEnvFilesCheckbox.checked && filename !== '.env') {
              continue;
            }

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
                sha: `${detail.sha}-${file.filename}`, // Unique dedup key
                patch: file.patch // Pass the patch text so we can parse keys for balance checks
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

    if (scanOldCommitsCheckbox && scanOldCommitsCheckbox.checked) {
      if (target.type === 'user') {
        renderError("Old Commits scanning is only supported for single repositories, not users.");
        return;
      }
      return scanOldCommitsLogic(target.name, keyword); // Call logic with custom keyword filter
    }

    if (onlyEnvFilesCheckbox && onlyEnvFilesCheckbox.checked) {
      keyword += " filename:.env";
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

    if (onlyEnvFilesCheckbox && onlyEnvFilesCheckbox.checked) {
      keyword += " filename:.env";
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
