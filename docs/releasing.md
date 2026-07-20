# Release and Auto-Update Checklist

Use this checklist for every Zotero Gemini Notebook release. The Zotero plugin
and Chrome companion are published together, but only the Zotero `.xpi` uses the
Zotero update manifest.

Two GitHub releases are involved:

- A versioned release such as `v0.3.1` holds the installable `.xpi` and Chrome
  extension `.zip`.
- The prerelease tagged `release` holds the stable `update.json` and beta
  `update-beta.json` at URLs that do not change between versions.

The Zotero add-on ID is permanently
`zotero-notebooklm@peterdresslar.com`. Renaming it would create a different
plugin and strand existing installations.

The examples below assume an upgrade from `v0.2.0` to `v0.3.1`. Substitute the
actual previous and new versions in later releases.

Published `v0.2.0` installations also contain an update URL under the former
`peterdresslar/zotero-notebooklm` repository name. GitHub's repository-rename
redirect keeps those installations connected to the new repository. Do not
create a different repository with the old name, because doing so would disable
that redirect and strand those installations.

## 1. Prepare the Release PR

1. Create a release-preparation branch from current `main`.
2. Update the version in both `package.json` and
   `chrome-extension/manifest.json`. Update
   `companionCompatibility.validVersions` in `package.json`; retain an older
   companion version only when its endpoint and browser-automation behavior are
   still compatible.
3. Update release-facing documentation and release notes. Keep “formerly
   NotebookLM” where it helps existing users find the renamed project.
4. Confirm that `addon/manifest.json` reflects the Zotero versions actually
   tested. Zotero recommends limiting `strict_max_version` to the latest minor
   version tested.
5. Build and validate the release artifacts:

   ```bash
   pnpm install --frozen-lockfile
   pnpm run package:release
   pnpm run lint:check
   ```

   `package:release` fails if the Zotero and Chrome versions diverge, the stable
   add-on ID or repository changes, archive manifests are misplaced, update URLs
   are wrong, compatibility ranges disagree, or the XPI does not match its
   declared update hash.

6. Install the candidate `.xpi` and unpacked Chrome extension from
   `.scaffold/build/`. Complete a Zotero-to-Gemini Notebook transfer. For
   transport changes, include a batch whose combined source size exercises the
   chunked path beyond Chrome's 64 MiB extension-message limit.
7. Open and merge the PR only after CI and manual testing pass.

## 2. Rebuild From Clean `main`

After the release-preparation PR is merged:

```bash
git switch main
git pull --ff-only
git status --short
pnpm install --frozen-lockfile
pnpm run package:release
pnpm run lint:check
```

Stop if the worktree is not clean or the validator does not pass. Release the
newly rebuilt files rather than artifacts retained from the PR branch.

## 3. Publish Versioned Assets Without Enabling Updates

Create and push an annotated tag for the exact merged commit:

```bash
git tag -a v0.3.1 -m "Release v0.3.1"
git push origin v0.3.1
```

Create a draft GitHub release for that existing tag and attach both installable
packages plus the generated manifest from `.scaffold/build/`. Use
`--verify-tag` so the release cannot silently target a different commit, and do
not mark it latest yet:

```bash
gh release create v0.3.1 \
  .scaffold/build/zotero-gemini-notebook.xpi \
  .scaffold/build/zotero-gemini-notebook-chrome-extension.zip \
  .scaffold/build/update.json \
  --repo peterdresslar/zotero-gemini-notebook \
  --verify-tag \
  --draft \
  --latest=false \
  --title "Zotero Gemini Notebook v0.3.1" \
  --notes-file docs/releases/v0.3.1.md
```

The release must contain:

```text
zotero-gemini-notebook.xpi
zotero-gemini-notebook-chrome-extension.zip
update.json
```

Review the tag target, title, notes, and filenames, then publish the GitHub
release without marking it latest. Publishing these assets makes them
anonymously downloadable, but existing Zotero installations will not discover
the new version until `release/update.json` changes.

```bash
gh release edit v0.3.1 \
  --repo peterdresslar/zotero-gemini-notebook \
  --draft=false \
  --latest=false
```

Before changing the update manifest:

1. Download both public assets without relying on a signed-in browser session.
2. Install the public `.xpi` directly in a disposable Zotero profile.
3. Load the public Chrome package and complete a basic transfer.

Do not announce the release or submit it to community directories yet.

## 4. Promote the Stable Update Manifest

Promote only `update.json` for a stable release. Do not replace
`update-beta.json` at the same time; the beta channel is independent.

First copy the new manifest to a versioned candidate name, upload it without
replacing the working manifest, and validate its anonymously accessible URL:

```bash
cp .scaffold/build/update.json /tmp/update-v0.3.1.candidate.json
gh release upload release \
  /tmp/update-v0.3.1.candidate.json \
  --repo peterdresslar/zotero-gemini-notebook
pnpm run release:verify-published \
  --manifest-url https://github.com/peterdresslar/zotero-gemini-notebook/releases/download/release/update-v0.3.1.candidate.json
```

Find the API URLs for the working manifest and verified candidate:

```bash
current_update_asset_endpoint="$(gh release view release \
  --repo peterdresslar/zotero-gemini-notebook \
  --json assets \
  --jq '.assets[] | select(.name == "update.json") | .apiUrl | sub("^https://api.github.com/"; "")')"
candidate_update_asset_endpoint="$(gh release view release \
  --repo peterdresslar/zotero-gemini-notebook \
  --json assets \
  --jq '.assets[] | select(.name == "update-v0.3.1.candidate.json") | .apiUrl | sub("^https://api.github.com/"; "")')"
```

Stop unless both variables contain a GitHub API endpoint. Preserve the old
asset by renaming it, then promote the already-uploaded candidate:

```bash
gh api --method PATCH "$current_update_asset_endpoint" \
  -f name=update-v0.2.0.backup.json
gh api --method PATCH "$candidate_update_asset_endpoint" \
  -f name=update.json
```

This ordering avoids deleting the working manifest before the replacement has
uploaded and passed validation. There is still a short interval between the two
renames, so complete them together and verify the stable public path
immediately:

```bash
pnpm run release:verify-published
```

This downloads `update.json`, follows its XPI link, checks the declared hash,
and verifies the packaged identity, version, compatibility range, and update
URL. For stable releases it also checks the legacy repository URL that published
`v0.2.0` installations still use.

GitHub's download cache can briefly return the previous asset after a rename.
If verification still sees `v0.2.0`, wait for the stable URL to return the new
manifest and rerun the command. Do not announce the release until verification
passes consistently.

## 5. Test an Actual Upgrade

Keep a disposable profile with the previous public version installed before
publishing the manifest. After `release/update.json` changes:

1. Record the installed version, enabled state, and any plugin preferences.
2. Use Zotero's plugin update check.
3. Confirm that Zotero upgrades to the new version without manual
   reinstallation.
4. Restart Zotero and confirm that the add-on remains enabled and retains its
   preferences.
5. Complete a Zotero-to-Gemini Notebook transfer with the companion packaged in
   the new release. When an older companion remains declared compatible, test
   the oldest retained version as well.

Record the Zotero, Chrome, and operating-system versions tested in the GitHub
release or release issue.

## 6. Roll Back a Bad Manifest

If anonymous verification or the real upgrade fails, preserve the failed
manifest under a diagnostic name and rename the previous asset back to
`update.json`:

```bash
failed_update_asset_endpoint="$(gh release view release \
  --repo peterdresslar/zotero-gemini-notebook \
  --json assets \
  --jq '.assets[] | select(.name == "update.json") | .apiUrl | sub("^https://api.github.com/"; "")')"
backup_update_asset_endpoint="$(gh release view release \
  --repo peterdresslar/zotero-gemini-notebook \
  --json assets \
  --jq '.assets[] | select(.name == "update-v0.2.0.backup.json") | .apiUrl | sub("^https://api.github.com/"; "")')"
gh api --method PATCH "$failed_update_asset_endpoint" \
  -f name=update-v0.3.1.failed.json
gh api --method PATCH "$backup_update_asset_endpoint" \
  -f name=update.json
pnpm run release:verify-published \
  --expected-version 0.2.0
```

If the second rename fails, rename the failed asset back to `update.json` while
investigating. Restoring the previous manifest prevents additional automatic
upgrades. It does not downgrade users who already received the bad version, so
preserve the versioned release and prepare a higher-version fix when necessary.

## 7. Announce the Release

After the automatic upgrade succeeds:

1. Finalize the GitHub release notes with the tested environments and mark the
   release as latest:

   ```bash
   gh release edit v0.3.1 \
     --repo peterdresslar/zotero-gemini-notebook \
     --latest
   ```

2. Announce the release in the Zotero Forums.
3. Submit the plugin to the appropriate community directory.
4. Keep the versioned release and its XPI available for as long as an update
   manifest points to it.
