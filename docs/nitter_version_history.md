# Nitter Version History & Backup Registry

This document logs the commit history, version states, and custom modifications for the `nitter-dev` service in MediaMonitor. It serves as a rollback reference if an upstream update introduces regressions.

---

## 📌 Backup State (Pre-Update: Working Version before Aug 19, 2026)

### 1. Version & Commit Identifiers
* **Local Branch**: `local/init`
* **Pre-Update Working Commit Hash**: `a82fafc07c4d4609c8d87ea15ef6e7bc3d7ad6b8`
* **Commit Subject**: `init local`
* **Upstream Base Commit**: `d5ff410c5d30c27fb6450230de80d82e80fed816` (*Add same-origin referrer policy*)
* **Commit Date**: Tue Jun 2 18:47:34 2026 +0530

### 2. Key Local Customizations in `a82fafc`
* **`.gitignore`**: Added `sessions-dev.json*` ignore pattern.
* **`compose.yml` (formerly `docker-compose.yml`)**:
  * Configured service names `nitter-dev` and `redis-dev`.
  * Mapped host port `8081:8080`.
  * Mounted `./sessions-dev.jsonl:/src/sessions.jsonl:ro`.
  * Added `extra_hosts`: `"host.docker.internal:host-gateway"`.
* **Untracked Local Files**:
  * `proxies.json`
  * `proxy_rotator.js`

### 3. How to Roll Back to This Pre-Update Working Commit
If the updated Nitter build experiences issues or unexpected regressions, run the following commands in `MediaMonitor/nitter-dev`:

```bash
# 1. Stash any uncommitted working changes (such as compose.yml host mapping)
git stash

# 2. Reset local branch back to the pre-update working commit
git reset --hard a82fafc07c4d4609c8d87ea15ef6e7bc3d7ad6b8

# 3. Restore stashed changes
git stash pop

# 4. Rebuild the docker image
docker compose build --no-cache
docker compose up -d
```

---

## 🚀 Updated State (Current Version: August 19, 2026)

* **Merge Commit Hash**: `ea1028737cc3e1a1525d4e555445030f34e7abf3`
* **Merged Upstream Commit**: `0bc9702` (*Detect and handle Cloudflare error responses*)
* **Total New Upstream Commits Merged**: 82 commits
* **Update Timestamp**: August 19, 2026 (16:30 IST)
* **Status**: Successfully merged into `local/init` branch. All local configurations (`compose.yml` port mappings, extra hosts, volume mounts, `proxies.json`, `proxy_rotator.js`) have been preserved.

### Key Features & Patches Merged:
1. **Anti-bot & Scraping Reliability**: Cloudflare error handling, updated GraphQL query hashes, replacement for restricted `UserResultByIdQuery` endpoint.
2. **Session Script Refactor**: Updated session creation & validation tools for Twitter login flows.
3. **Features**: Twitter Spaces audio playback (HLS.js), Communities, Articles rendering, video download button, RSS feed expansion (polls/previews), search filters (Top/Latest/Media/Lists).
4. **Security & Fixes**: SSRF patch in `/video` proxy, HTML escaping in mention/URL text.
