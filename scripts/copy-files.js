// scripts/copy-files.js
const fs = require('fs');
const path = require('path');

const browser = process.argv[2];
if (!browser) {
  console.error('Browser not specified');
  process.exit(1);
}

const srcDir = 'src';
const destDir = `dist/${browser}`;

// Create destination directory
fs.mkdirSync(destDir, { recursive: true });
fs.mkdirSync(path.join(destDir, 'icons'), { recursive: true });

// Files to copy (excluding manifest files)
const filesToCopy = [
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js'
];

// Copy files
filesToCopy.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to ${browser}`);
  } else {
    console.warn(`Warning: ${file} not found in src/`);
  }
});

// Copy icons
const iconsDir = path.join(srcDir, 'icons');
const destIconsDir = path.join(destDir, 'icons');

if (fs.existsSync(iconsDir)) {
  const iconFiles = fs.readdirSync(iconsDir);
  iconFiles.forEach(iconFile => {
    const srcIconPath = path.join(iconsDir, iconFile);
    const destIconPath = path.join(destIconsDir, iconFile);
    fs.copyFileSync(srcIconPath, destIconPath);
    console.log(`Copied icon ${iconFile} to ${browser}`);
  });
} else {
  console.warn('Warning: icons directory not found - you need to create icon files');
}

console.log(`✅ Files copied to dist/${browser}/`);