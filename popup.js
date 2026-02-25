document.addEventListener('DOMContentLoaded', () => {
  const targetUrlInput = document.getElementById('target-url');
  const searchKeywordInput = document.getElementById('search-keyword');
  const scanRepoBtn = document.getElementById('scan-repo-btn');
  const searchRepoBtn = document.getElementById('search-repo-btn');
  const searchGlobalBtn = document.getElementById('search-global-btn');
  const resultsDiv = document.getElementById('results');

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
    resultsDiv.innerHTML = `<span class="error"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> ${msg}</span>`;
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
      resultsDiv.innerHTML = `<span class="success"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> No exposures found for ${label}!</span>`;
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

  scanRepoBtn.addEventListener('click', async () => {
    let repo = getRepoFromUrl(targetUrlInput.value);
    if (!repo) {
      renderError("Please enter a valid GitHub repository URL.");
      return;
    }

    // Predefined queries to look for secrets
    let queries = [
      `filename:.env repo:${repo}`,
      `filename:id_rsa repo:${repo}`,
      `filename:credentials repo:${repo}`,
      `"AKIA" repo:${repo}`,
      `"BEGIN PRIVATE KEY" repo:${repo}`
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
