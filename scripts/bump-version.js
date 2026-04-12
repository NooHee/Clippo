#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Parse version
const [major, minor, patch] = packageJson.version.split('.').map(Number);

// Bump patch version
packageJson.version = `${major}.${minor}.${patch + 1}`;

// Write back
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`✓ Version bumped to ${packageJson.version}`);
