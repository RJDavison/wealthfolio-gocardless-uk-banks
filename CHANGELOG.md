# Changelog

All notable changes to the gocardless-uk-banks addon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-18

### Added

- Initial release.
- Live UK institution picker from GoCardless (`institutions/?country=gb`), searchable by name,
  BIC or institution ID.
- Multiple simultaneous bank connections, each with its own requisition, consent status and
  account mapping. One shared set of GoCardless credentials and tokens.
- Consent creation, browser approval link, status check, renewal and disconnection. Account
  mapping and sync history carry over when a consent is renewed.
- Import of bank transactions as Wealthfolio deposits and withdrawals with `sourceRecordId`
  deduplication, opening-balance reconciliation, account mapping and a create-account shortcut.
- 12-hour pending-bank-data cache scoped by connection and account, so a failed import can be
  retried without another bank request.
- Actionable error for missing Wealthfolio network-host approval, with instructions to tick
  `bankaccountdata.gocardless.com` under the add-on permissions.
