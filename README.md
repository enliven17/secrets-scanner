# GitHub Secrets Scanner Extension

A lightweight, minimal Chrome extension that helps you quickly scan GitHub repositories for accidentally exposed secrets like `.env` files, API keys, AWS credentials, and private RSA keys.

## Features

- **Auto-Detect Repository:** Automatically pre-fills the repository URL when you open the extension on a GitHub repository page.
- **Scan Common pattern:** Scans a specific repository for common secret exposures (`.env`, `id_rsa`, `credentials`, AWS `AKIA` keys, `BEGIN PRIVATE KEY`).
- **Custom Search:** Search for specific custom keywords within a single repository.
- **Global Search:** Search for any custom keyword across all public repositories on GitHub.
- **Minimalist UI:** Clean, modern, and dark-mode native interface that matches the GitHub developer aesthetic.

## Installation

Since this extension is not published to the Chrome Web Store yet, you can install it manually:

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the folder containing this extension's files (`manifest.json`, `popup.js`, etc.).
6. The extension is now installed! You can pin it to your toolbar for easy access.

## Requirements

Due to GitHub API rate limits and authentication requirements for the Code Search API, **you must provide a GitHub Personal Access Token (PAT)** for this extension to function correctly. 

Please see the [HOW_TO_GET_GITHUB_TOKEN.md](HOW_TO_GET_GITHUB_TOKEN.md) file for straightforward instructions on how to generate and configure your token. The token is stored securely in your browser's local storage and is only sent to the official GitHub API.

## Privacy & Security

- Your Personal Access Token (PAT) never leaves your browser device except to authenticate with `api.github.com`.
- No analytics or third-party tracking are used.
