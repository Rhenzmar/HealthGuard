# GitHub Naming and Reader-Repository Handoff

## Target naming

| Item | Current | Recommended |
| --- | --- | --- |
| Private development repository | `Rhenzmar/PhysioGraph` | `Rhenzmar/HealthGuard` (rename existing repo; preserve its history) |
| Separate public reader-facing repository | Not yet created | `Rhenzmar/HealthGuard-Project` |
| Website | `physiograph-dashboard.onrender.com` | Keep working URL until a verified new domain is deployed |
| Python import paths / API environment variables | `physiograph/`, `PHYSIOGRAPH_*` | **Keep unchanged** for software compatibility |
| Root README | Old backend-only PhysioGraph release description | Current HealthGuard overview (updated) |
| Historical release notes | Backend v0.x–v1.5 | Retain as development archive, do not bulk rename history |

## Why we should not blindly rename everything

A GitHub repository rename normally redirects links, but external connections, deploy hooks, scripts, secrets, third-party integrations, README links, local clones and CI may still need checking. All currently connected Render services deploy the **same repository's main branch**. Keep the actual code, internal imports and service names stable while confirming that both the static site and API still receive commits.

Do not change `physiograph/`, `PHYSIOGRAPH_*` or `VITE_PHYSIOGRAPH_API_BASE` just to make the public naming look clean; those are active integration interfaces. Keep historical reports intact so archived benchmark evidence stays reproducible.

## Safe order of operations

1. Keep a copy of the current default-branch SHA and deployment settings.
2. Rename **only the GitHub repository** from PhysioGraph to HealthGuard in GitHub repository **Settings → General → Repository name**, if you have owner/admin permission.
3. Check the new repository's `main` history and default branch. Check GitHub Actions and both backend Render services plus the frontend Render site. Update the connected repo in Render **only if the existing integration does not follow the rename**.
4. Update any source URLs or external project-page links that need the canonical new GitHub path. Check badge and asset links.
5. Consider a public `HealthGuard-Project` reader repository (a **new repository with no private history**) containing the sanitized files in `docs/reviewer-repository/`. This should link to the working demo and project page, rather than copying the whole private implementation or NASA datasets.
6. Verify public access using a signed-out browser; confirm the reader repository doesn't contain secrets, private credentials, personally identifying information, unpublished model artifacts, raw data with uncertain redistribution rights, or internal API keys.

## Reader repository visibility

The development repo is currently **private**. Do **not** change its visibility to public as a shortcut: this can expose the entire historical commit graph and assets, which a sanitized reader repository avoids. Review and obtain team approval for anything published publicly.

A README alone cannot grant an open-source license for mixed-source code, research data and third-party media. Only add a license after a rights review and agreement from the owners.

## Manual operations still required

The connected GitHub tool currently allows editing files and branches, but **does not expose repository creation, repository rename or visibility changes**. These specific GitHub Settings actions must be completed in the GitHub UI by an owner/admin, or with a separately authorized integration capable of the operation.

**New reader repository:** GitHub → New repository → name `HealthGuard-Project` → select Public only after review → initialize with README → paste the prepared files from `docs/reviewer-repository/`, maintaining the same relative paths. Keep the development repo private.
