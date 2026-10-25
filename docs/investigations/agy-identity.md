# `agy` identity investigation

Date: 2026-10-25

## Inference

The available evidence supports the inference that `agy.exe` is the **Antigravity CLI**, not an unrelated product, and is the command-line companion to the Antigravity desktop application. The CLI and desktop application have separate executable/version identities:

- CLI: `%LOCALAPPDATA%\agy\bin\agy.exe`, changelog release `1.4.7`.
- Desktop: `%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe`, ProductName `Antigravity`, CompanyName `Google`, ProductVersion `2.26.0.0`, FileVersion `2.26.0`.

## Read-only evidence

1. `agy.exe help` identifies an agent CLI with `--model`, `--agent`, MCP/plugin management, conversations, projects, print mode, and an `agy changelog` subcommand.
2. `agy.exe changelog` contains explicit product references:
   - `1.0.0: Initial release of the Antigravity CLI.`
   - `1.0.3: Added support for G1 credits in the Antigravity CLI.`
   - `1.0.4` describes importing conversations from `Antigravity 2.0` into the CLI and uses the `antigravity-cli` cache/config namespace.
   - `1.0.5` says CLI permissions merge settings shared with Antigravity.
   - `1.4.7` is the current changelog heading and includes normal CLI agent, MCP, plugin, hook, and model behavior.
3. `ao agent ls --json` lists an installed, authorized harness with `"id": "agy"` and `"label": "Agy"`.
4. The desktop installation at `%LOCALAPPDATA%\Programs\antigravity` contains `Antigravity.exe`; its file metadata reports ProductName `Antigravity`, CompanyName `Google`, and version `2.26.0`. The installation also contains `resources\app.asar`, `resources\app-update.yml`, and a `version` file (`44.4.3`).

## Remaining uncertainty

No readable file in the desktop installation directly names the path of `agy.exe`, and the `agy.exe` Windows file metadata does not expose ProductName or CompanyName. The direct executable-to-executable packaging relationship is therefore not proven locally. The product relationship is nevertheless established by the CLI's own changelog references to Antigravity, shared configuration/permissions, conversation compatibility, and the AO harness registration.

No model prompt, paid provider call, or configuration change was performed.
