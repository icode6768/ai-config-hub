# Windows / macOS portable WebUI

Use `start-windows.bat` or `start-macos.command` in the project root.
Both launchers select `webui-apps/<process.platform>-<process.arch>/` using
the active Node runtime, including Intel (`darwin-x64`) and Apple Silicon
(`darwin-arm64`) installations.

Each runtime contains its own source snapshot, `node_modules`, and `dist`.
Do not copy one platform's `node_modules` over another platform's directory.
Keep Node versions consistent for each platform. Native dependency validation
runs at startup; changing the Node ABI or dependency lock file reinstalls that
platform's dependencies. First-time preparation requires network access.
Once a platform is prepared, unchanged launches work without npm downloads.

The original `webui` remains the editable source. Changes are synchronized on
the next launch, and its frontend is rebuilt only when inputs change.
Configuration and application data remain under the original project root via
`USB_LOBSTER_ROOT`; the runtime directory is never the user data directory.
The server currently still uses tsx and Vite middleware, so dev dependencies
must be included in each runtime package.

Prepare without starting the server, on each supported platform:

```sh
node webui/scripts/launch-portable.mjs --prepare
```

Run the launcher regression test after preparing the current platform:

```sh
node --test webui/tests/portable-launcher.test.mjs
```

To distribute offline, include the prepared platform directories along with
their matching portable Node runtimes. macOS `.sh` and `.command` files must
use LF line endings. `.gitattributes` enforces this for Git checkouts.
Windows runtime packages prepared from macOS still require a Windows smoke
test; Apple Silicon needs its own preparation when using an ARM64 Node binary.

## Hermes Python environments

The panel runs `webui/scripts/launch-hermes.mjs`. It selects
`.hermes/venvs/win32-x64` or `.hermes/venvs/darwin-x64` using the active Node
platform and architecture. Existing platform-compatible `hermes-agent/venv`
and `hermes-agent/.venv` environments remain supported as fallbacks.

The launcher uses Python directly, repairs `pyvenv.cfg` against the portable
Python of the same major/minor version, and runs from the shared Hermes source.
It loads the API key from the project configuration inside the Python process,
so it is absent from generated terminal commands. It does not source activation
scripts or use platform-specific `hermes.exe` / `hermes` entrypoint shims.

Child processes inherit the launcher's Node directory ahead of the host PATH,
so desktop npm scripts use the same Node version as the panel launcher.
On Windows, duplicate case-insensitive Path/PATH entries are removed.
The Python bootstrap also restricts Hermes' managed Node lookup to that
directory. It must not auto-repair a Windows `.hermes/node` tree on macOS.

Verify the current platform with:

```sh
node webui/scripts/launch-hermes.mjs --version
```

Keep each platform's Python environment separate, including its native wheels.
Do not copy Windows site-packages into a macOS environment. Moving the USB drive
does not require regenerating Hermes entrypoint shims because they are bypassed.
