# CI/CD and npm release

## Continuous integration

`.github/workflows/public-checks.yml` runs on pushes, pull requests, and manual
dispatches. It installs from `package-lock.json`, then runs typecheck, the full
test suite, the build, the built CLI entry smoke test, and `npm pack --dry-run`.

The CLI smoke test is run after the build so the workflow verifies the path
declared by `package.json`'s `inspector` bin entry.

## Release trigger

`.github/workflows/publish.yml` only runs for version tags matching `v*.*.*`.
The tag must exactly match the package version: for version `2.0.0`, create the
tag `v2.0.0`.

The workflow runs the same verification gates before publishing. It refuses to
publish while `package.json` contains `"private": true`; this repository is
therefore safe to push and test without accidentally publishing the assessment
package.

## Enabling npm publishing later

Before the first release, a maintainer must:

1. Decide on a public package name and remove `private: true` only when the
   package is ready to ship.
2. Verify that the `repository` metadata in `package.json` exactly matches the
   public GitHub repository used for publishing.
3. Configure npm Trusted Publishing for the GitHub repository and the exact
   workflow filename `publish.yml`.
4. Allow the `npm publish` action in the npm trusted-publisher configuration.
5. Confirm the GitHub repository is public and protect who can create release
   tags.

The workflow grants only `contents: read` and `id-token: write` and does not use
a long-lived `NPM_TOKEN`. After the configuration is complete, merge the
release commit, create the matching version tag, and push that tag to GitHub.
