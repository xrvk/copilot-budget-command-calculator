# Security

Thank you for helping keep this project safe.

## Reporting Security Issues

If you believe you have found a security vulnerability in this project, please report it responsibly.

**Please do not report security vulnerabilities through public GitHub issues or pull requests.**

Instead, please use this repository's private vulnerability reporting feature to submit your finding directly.

Please include as much of the following as you can:

- The type of issue (e.g., credential exposure, cross-site scripting)
- Full paths of source file(s) related to the issue
- Steps to reproduce
- Impact of the issue and how an attacker might exploit it

## Scope

This is a client-side only application. Credentials entered by users are stored in browser memory and never transmitted to any server other than the GitHub API endpoints the user configures. Security concerns most relevant to this project include:

- Unintended credential leakage (e.g., tokens logged or persisted)
- Cross-site scripting in rendered content
- Dependency vulnerabilities

## Response

This project is maintained by a single person on a best-effort basis. I will acknowledge reports as quickly as possible and work to address confirmed vulnerabilities promptly, but cannot guarantee specific response times.
