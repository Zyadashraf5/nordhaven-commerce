# Secrets Exclusion and Incident Response

Credentials, tokens, private keys, production configuration, usable connection strings, cookies,
authorization headers, and recovery material must never be committed or logged. Use the approved
runtime secret mechanism; `.env` is local-only and ignored.

If exposure is suspected: stop dissemination, revoke or rotate the value immediately, preserve an
audit trail without copying the secret, notify the security owner, remove it from the current tree,
and use an approved history-remediation procedure. Rotation is mandatory because deleting a file
does not invalidate a leaked credential. Never rewrite shared Git history without explicit owner
coordination and approval.

## Identity material (Milestone 02)

Nothing a client can replay is stored in recoverable form:

| Material                               | Where it lives                            | Stored form                                      |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| Account password                       | `users.password_hash`                     | versioned `scrypt` hash with a random salt       |
| Session credential                     | `sessions.token_hash`                     | SHA-256 digest; the raw token is returned once   |
| Password reset token and MFA challenge | `identity_tokens.token_hash`              | SHA-256 digest                                   |
| Administrator TOTP shared secret       | `admin_mfa_credentials.secret_ciphertext` | AES-256-GCM, format `v1:<iv>:<tag>:<ciphertext>` |
| Administrator recovery codes           | `admin_mfa_recovery_codes.code_hash`      | SHA-256 digest; single use                       |

`AUTH_ENCRYPTION_KEY` is the only identity value that must be supplied out of band. It is validated
as base64 for exactly 32 bytes, is never logged, echoed, returned in a response, or written to a
security event, and it is the sole key material needed to read administrator MFA secrets. Rotating
it makes existing `admin_mfa_credentials` rows undecryptable, so treat rotation as a controlled
operation: provision the replacement, then have each administrator enroll a new authenticator. Do
not attempt to rotate it by editing the value in place and restarting without that plan.

Recovery delivery (email or another channel) is not approved yet (HC-DEC-014). Until a provider is
selected, only the `none`, `file` (development, ignored `tmp/notifications`, refused in production),
and `memory` (tests) transports exist. Recovery material handed to a transport is never logged; the
file transport logs only the artifact path.

Redaction applies the same rules to logs as to durable records: passwords, session credentials, MFA
secrets and codes, recovery tokens and codes, `authorization` and `cookie` headers, and connection
strings are removed before serialization. Correlation IDs are the only request-derived value that
reaches a log or a response.
