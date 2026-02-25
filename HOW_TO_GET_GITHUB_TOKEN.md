# How to Get a GitHub Personal Access Token (PAT)

This extension requires a **GitHub Personal Access Token (PAT)** to securely access the GitHub Code Search API and avoid severe rate limits. 

Here is how you can easily create one:

1. **Log into GitHub**
   Go to [github.com](https://github.com) and log in to your account.

2. **Go to Developer Settings**
   Click on your profile picture in the top-right corner, scroll down to the bottom, and click on **[Settings](https://github.com/settings/profile)**. 
   Then, scroll down the left sidebar and click on **[Developer settings](https://github.com/settings/apps)** (at the very bottom).

3. **Open PAT Settings**
   On the left sidebar, click **Personal access tokens**, then click **Tokens (classic)**.

4. **Generate a New Token**
   In the top-right, click **Generate new token** -> **Generate new token (classic)**.
   *(You might be asked to enter your password again for security).*

5. **Configure the Token**
   - **Note:** Give it a simple name so you remember what it is for (e.g., `Secrets Scanner Extension`).
   - **Expiration:** Set it to `No expiration` or whichever length you prefer. 
   - **Scopes (Permissions):** 
     - If you only want to scan **Public Repositories**, you **do not** need to check any boxes. Just leave them empty.
     - If you want the extension to scan your **Private Repositories** as well, check the checkbox next to `repo` (Full control of private repositories).

6. **Create and Copy**
   Scroll to the very bottom and click **Generate token**.
   
   🎉 **IMPORTANT:** Copy the long string starting with `ghp_` immediately! GitHub will never show it to you again.

7. **Save in the Extension**
   - Click the extension icon in Chrome.
   - Click **Settings** in the bottom right corner.
   - Paste your `ghp_...` token and click **Save Token**. 
   
   *Your token is strictly stored locally on your own browser.*
