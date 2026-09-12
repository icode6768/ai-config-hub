# Portable Harness launch

The macOS and Windows launchers run the built apps/cli/lib/bin.js web profile
with the project's platform-specific Node runtime. Both use this .dsh directory
for settings and session data. No temporary build directory is used at runtime.

The panel migrates an old sibling `dsh/` directory into `.dsh/` before startup.
Existing `.dsh/` files take precedence. Conflicting legacy files are preserved
under `.dsh/legacy-dsh-*/` with their relative paths, including credentials and
profile settings. This backup is private state and must not be committed.

The exFAT USB copy stores workspace packages as ordinary directories in
deepseek-harness/node_modules. Windows and macOS native packages have distinct
names or prebuild directories; keep both when updating dependencies. Do not run
a platform-specific clean install over the shared dependency directory.

Build the complete Harness repository on a filesystem supporting workspace
links, including host libraries, client libraries and the web frontend. Then run:

```sh
node prepare-portable-packages.mjs /path/to/built-harness /path/to/staging
```

Merge the generated staging contents into deepseek-harness, preserving existing
platform binaries. Keep the generated root and app package.json files alongside
the built files; the CLI reads its version from apps/cli/package.json.
Include lib/types JavaScript: some bundled entries reference
it at runtime. External dependencies and platform prebuilds must also be present.
Verify web startup on each target OS after packaging. macOS launch scripts use LF.
