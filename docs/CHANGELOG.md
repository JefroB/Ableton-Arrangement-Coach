# Changelog

All notable changes to Arrangement Coach are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-06-14

### Added
- Version number displayed in the help dialog header (stays in sync with manifest.json on each release)

## [1.1.0] - 2026-06-14

### Fixed
- Stale CuePoints from previous project bleeding into new projects after Live Set switch (fingerprint-based project-change detection)
- Panel blocked from opening when project has no locators (removed early-return guard, allowing Generate Sections workflow)
- "Generate Sections" button not placing markers (`cuePoint.setName` doesn't exist — SDK uses property setter `cuePoint.name = ...`)
- Generated sections not detected immediately after creation (added locator rescan before dialog reopen)

### Changed
- Generated section markers now start 4 bars into the timeline, leaving empty lead-in space before the first section

### Internal
- Added `getSongFingerprint()` to SdkAdapter interface for project-change detection
- Added diagnostic logging to generate_sections handler
- Created changelog, GitHub/versioning skills, and steering files
- Updated ui-design skill to reflect actual implementation
