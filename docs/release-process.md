# Automatic versioning and releases

This document explains how Clippo's version number is bumped, how the changelog is written and how
macOS builds reach GitHub Releases, without anyone editing `package.json` by hand.

## TL;DR

- Every pull request title follows [Conventional Commits](https://www.conventionalcommits.org/). A CI
  check enforces it, and squash merging turns that title into the commit on `main`.
- On every push to `main`, after tests and the macOS build pass,
  [release-please](https://github.com/googleapis/release-please) reads the new commits and keeps a
  **release PR** open: `chore(main): release 0.3.0`. That PR bumps `package.json` and
  `package-lock.json`, updates `.release-please-manifest.json` and prepends the release notes to
  `CHANGELOG.md`.
- Merging the release PR is the decision to ship. release-please creates the `v0.3.0` tag and the
  GitHub Release, and the `publish` job attaches the `.dmg` and `.zip` built from that exact commit.

```
feature PR "feat: pin entries"  --squash-->  main  --CI-->  release PR "release 0.3.0" (auto-updated)
feature PR "fix: paste in Slack" --squash-->  main  --CI-->  release PR "release 0.3.0" (notes grow)
                                                            |
                                              merge release PR
                                                            v
                         main --CI--> tag v0.3.0 + GitHub Release + Clippo-0.3.0.dmg / -arm64-mac.zip
```

## How a commit maps to a version

Clippo is still `0.x`, where SemVer allows breaking changes in minor versions. The config sets
`bump-minor-pre-major` so a breaking change does not jump straight to `1.0.0`; going to `1.0.0` is a
deliberate choice (see below).

| PR title                                  | Release notes section | Bump while 0.x  | Bump from 1.0 |
| ----------------------------------------- | --------------------- | --------------- | ------------- |
| `fix: paste lands in the wrong window`    | Bug Fixes             | 0.2.1 to 0.2.2  | patch         |
| `perf: open the popup without a reflow`   | Performance           | 0.2.1 to 0.2.2  | patch         |
| `feat: pin entries to the top`            | Features              | 0.2.1 to 0.3.0  | minor         |
| `feat!: new storage format` (or a `BREAKING CHANGE:` footer) | Features, flagged breaking | 0.2.1 to 0.3.0 | major |
| `docs:`, `ci:`, `build:`, `test:`, `refactor:`, `style:`, `chore:` | hidden | no release | no release |

Several merged PRs accumulate in one release PR, and the highest bump wins (one `feat` plus three `fix`
gives one minor release).

## Why release-please (and not semantic-release or a bump script)

The repository used to bump the version in two ways: `scripts/bump-version.js` (always `patch + 1`,
never called by CI) and editing `package.json` by hand. If a merge forgot the bump, the workflow
re-published the existing `v0.2.1` release with new binaries while the tag still pointed at the old
commit. The script was removed.

| Option | How it works | Why not (or why) for Clippo |
| ------ | ------------ | --------------------------- |
| Manual bump / `npm version` | Developer edits the version | Easy to forget, no changelog, the bug described above. |
| Bump on every merge (patch + 1 script) | CI increments and pushes | Every merge is a release, a docs typo ships a new app, and the version says nothing about the change. Needs CI to push to `main`. |
| semantic-release | Fully automatic: each releasable merge is tagged and published immediately | Good for libraries. It needs CI to push a version commit back to `main` (fights branch protection) or keeps the version only in tags, while an Electron app bakes `package.json`'s version into the binary and the About screen. No human gate before shipping. |
| **release-please** (chosen) | A bot PR proposes the next version and changelog; merging it releases | The version bump is an ordinary reviewed PR, so it works with branch protection and the build sees the real version. Releasing is a conscious click, not a side effect of merging a refactor. Maintained by Google, used by large projects. |

## The files involved

| File | Role |
| ---- | ---- |
| `release-please-config.json` | Release type `node` (updates `package.json` and `package-lock.json`), tags without a component (`v0.3.0`), changelog sections, `bump-minor-pre-major`. |
| `.release-please-manifest.json` | The last released version (`0.2.1` at setup). release-please updates it in each release PR; it is the source of truth for "what was released last". |
| `CHANGELOG.md` | Generated release notes. Do not edit by hand; fix notes via the commit override below. |
| `.github/workflows/release.yml` | `test` then `build` on every PR and push; on `main` also `release-please` then `publish`. |
| `.github/workflows/pr-title.yml` | Fails a PR whose title is not a Conventional Commit. |
| `.github/dependabot.yml` | Monthly PRs to update the SHA-pinned third-party actions. |

## The pipeline in detail

`release.yml` has four jobs.

1. **test** (Ubuntu): type check, Vitest, end-to-end smoke test under Xvfb.
2. **build** (macOS): `npm run dist -- --publish never`, then uploads the `.dmg` and `.zip` as a
   workflow artifact. `--publish never` matters: electron-builder publishes on its own when it detects
   a tagged CI build, and only one job should own publishing.
3. **release-please** (push to `main` only, after build): opens or updates the release PR, or, if the
   commit being built is a merged release PR, creates the tag and the GitHub Release and outputs
   `release_created`, `tag_name` and `version`.
4. **publish** (only when `release_created`): downloads the artifacts from step 2, checks that their
   file names carry the version that was just tagged, uploads them with `gh release upload`, and
   appends download instructions to the generated notes.

Design choices worth calling out:

- **Release only from a green commit.** release-please runs after `test` and `build`, so a failing
  `main` can never be tagged.
- **Build once, ship what was tested.** The binaries attached to the release are the ones the `build`
  job produced for that commit, not a second rebuild. The release commit already contains the bumped
  `package.json`, so the app's `app.getVersion()` matches the tag. The version check fails the job
  if that assumption ever breaks.
- **Least privilege.** The workflow default is `contents: read`. Only `release-please` gets
  `contents: write` and `pull-requests: write`, and only `publish` gets `contents: write`.
- **Concurrency.** Runs for the same PR cancel each other; runs on `main` are queued and never
  cancelled, so a release is never half published.
- **Supply chain.** Third-party actions (`release-please-action`, `action-semantic-pull-request`) are
  pinned to a full commit SHA with the version in a comment, since a tag can be moved by whoever owns
  it. Dependabot proposes updates. First-party `actions/*` stay on major tags.
- **`pull_request_target` for the title check** so it also works for PRs from forks. It is safe here
  because the job never checks out or runs code from the PR; it only reads the title.

## One-time repository settings

These are GitHub settings, not files, so they are listed here.

1. **Settings > Actions > General > Workflow permissions**: tick *Allow GitHub Actions to create and
   approve pull requests*. Without it release-please cannot open the release PR with the default token.
2. **Settings > General > Pull Requests**: allow squash merging and set *Default commit message* to
   *Pull request title* (or *title and description*). Optionally disable merge commits and rebase
   merging so every change lands as one Conventional Commit.
3. **Optional, `RELEASE_PLEASE_TOKEN` secret**: GitHub does not start workflows for events created by
   the built-in `GITHUB_TOKEN`, so CI does not run on the release PR by default. That is acceptable
   (the release PR only changes the version and changelog, and the release itself is gated on CI on
   `main`), but if `main` has required status checks, add a fine-grained personal access token or a
   GitHub App token with *Contents* and *Pull requests* read/write as `RELEASE_PLEASE_TOKEN`. The
   workflow uses it automatically when present.
4. **Optional branch protection on `main`**: require `test`, `build` and *Conventional Commit title*.

## Day-to-day usage

- **Shipping a release**: open the release PR, read the generated notes, merge it. Nothing else.
- **Forcing a version** (for example the first `1.0.0`): merge a commit whose body contains
  `Release-As: 1.0.0`, e.g. a PR with that line in its description when the squash message uses the
  description.
- **Fixing release notes after merge**: edit the merged PR's description and add
  ```
  BEGIN_COMMIT_OVERRIDE
  feat: open the popup instantly and paste into the previous text field
  END_COMMIT_OVERRIDE
  ```
  The next release-please run uses that text instead of the original commit message. This also rescues
  commits merged before this setup, such as PR #17, whose title was not a Conventional Commit and is
  therefore ignored.
- **A release went wrong**: the tag and release can be deleted on GitHub and the release PR re-merged
  or recreated; the manifest file says which version release-please considers released.

## Trade-offs and limitations

- Contributors have to learn the Conventional Commits prefixes. The title check gives an immediate,
  explicit error, and only the PR title matters, not every commit on the branch.
- Releases are not fully hands-off: someone has to merge the release PR. That is intended for a
  desktop app, where each release reaches users' machines.
- The builds are not code signed or notarized (`CSC_IDENTITY_AUTO_DISCOVERY: false`), so users still
  need right-click > Open on first launch. Signing would slot into the `build` job with an Apple
  Developer certificate stored as secrets.
- The app notifies users about new releases and links to the right download (see
  [update-notifications.md](update-notifications.md)), but cannot install them by itself until the
  builds are signed. That relies on what this pipeline guarantees: increasing SemVer tags and
  consistent asset names (`Clippo-X.Y.Z.dmg`, `Clippo-X.Y.Z-arm64-mac.zip`).
