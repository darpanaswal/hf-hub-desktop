# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| latest (main) | ✅ |
| older releases | ❌ — please upgrade |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: [your-email@example.com] with subject: `[HF Hub Desktop] Security`

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix

You will receive a response within 72 hours. If the issue is confirmed, a patched release will be issued as quickly as possible.

## Scope

### In scope
- The FastAPI backend (authentication bypass, arbitrary code execution, path traversal)
- The VS Code extension webview (XSS, CSP bypass)
- The Electron app (remote code execution via webview)
- Credential/token handling

### Out of scope
- Vulnerabilities in `huggingface_hub`, `fastapi`, or other dependencies — report those upstream
- Issues requiring physical access to the machine
- Social engineering

## HF Token handling

Your Hugging Face token is stored in VS Code settings (`hfHub.token`) or passed via the `HF_TOKEN` environment variable. It is never logged or transmitted anywhere other than `huggingface.co`. The token is sent as a Bearer header in all `huggingface_hub` API calls.
