#!/usr/bin/env node
/**
 * Create SPEC-076 release tags at the current commit.
 *
 * Usage:
 *   node scripts/tag-release.mjs [--dry-run] [--release] [--extension]
 *     [--milestone <N>]
 *
 * Default (every store upload — create BEFORE uploading):
 *   v<PRODUCT_VERSION>-b<PRODUCT_BUILD_NUMBER>   e.g. v3.0.0-b3
 *
 * --milestone <N> creates the next milestone marker at HEAD:
 *   v<PRODUCT_VERSION>-m<N>                       e.g. v3.1.0-m12
 *
 * --release additionally creates the clean product tag:
 *   v<PRODUCT_VERSION>                            e.g. v3.1.0
 *
 * --extension additionally creates the Web Store tag:
 *   ext-v<manifest version>                       e.g. ext-v1.0.110.1
 *
 * Tags are immutable markers: never move, delete, or reuse one.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import {
  paths,
  readSharedVersion,
  readSharedBuildNumber,
  isDryRun,
} from './version-lib.mjs';

const dryRun = isDryRun(process.argv);
const includeRelease = process.argv.includes('--release');
const includeExtension = process.argv.includes('--extension');
const milestoneIndex = process.argv.indexOf('--milestone');
const milestoneN =
  milestoneIndex >= 0 ? process.argv[milestoneIndex + 1] : null;

const version = readSharedVersion();
const build = readSharedBuildNumber();
const buildTag = `v${version}-b${build}`;
const releaseTag = `v${version}`;
const manifest = JSON.parse(
  readFileSync(
    new URL('../apps/chrome-extension/manifest.json', import.meta.url),
    'utf8',
  ),
);
const extensionTag = `ext-v${manifest.version}`;

const PRODUCT_TAG_RE = /^v\d+\.\d+\.\d+(-(b|m)\d+)?$/;
const EXTENSION_TAG_RE = /^ext-v\d+(\.\d+){1,3}$/;

function git(args) {
  return execSync(`git ${args}`, { cwd: paths.root, encoding: 'utf8' }).trim();
}

function createTag(tag, label) {
  if (!PRODUCT_TAG_RE.test(tag) && !EXTENSION_TAG_RE.test(tag)) {
    throw new Error(`Invalid tag name: ${tag}`);
  }
  if (git(`tag -l ${tag}`)) {
    throw new Error(`Tag ${tag} already exists — never reuse tags.`);
  }
  if (dryRun) {
    console.log(`Would create ${label}: ${tag}`);
    return;
  }
  git(`tag ${tag}`);
  console.log(`Created ${label}: ${tag}`);
}

const dirty = git('status --porcelain');
if (dirty) {
  console.warn(
    '⚠  Worktree is not clean — tags should mark the exact commit being uploaded.',
  );
}

createTag(buildTag, 'build tag');
if (milestoneN != null) {
  if (!/^\d+$/.test(milestoneN) || Number(milestoneN) <= 0) {
    throw new Error(`--milestone must be a positive integer, got: ${milestoneN}`);
  }
  createTag(`v${version}-m${milestoneN}`, 'milestone tag');
}
if (includeRelease) createTag(releaseTag, 'release tag');
if (includeExtension) createTag(extensionTag, 'extension tag');

if (!dryRun) {
  console.log(
    'Next: build, upload, then record the build with scripts/record-build.mjs --tag <tag>.',
  );
}
