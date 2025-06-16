// build.js - Simple build script that requires no external dependencies
const fs = require('fs');
const path = require('path');

console.log('🍪 Building Cookie Policy Analyzer Extension...\n');

// Build configuration
const browsers = [
  { name: 'chrome', manifest: 'manifest-v3.json' },
  { name: 'firefox', manifest: 'manifest-v2.json' },
  { name: 'edge', manifest: 'manifest-v3.json' }
];

const filesToCopy = [
  'background.js',
  'content.js', 
  'content.css',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js'
];

// Clean and create directories
function cleanAndCreateDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// Copy file with error handling
function copyFile(src, dest, description) {
  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  ✅ ${description}`);
      return true;
    } else {
      console.log(`  ⚠️  ${description} - File not found: ${src}`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ${description} - Error: ${error.message}`);
    return false;
  }
}

// Copy directory recursively
function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }
  
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src);
  
  files.forEach(file => {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
  
  return true;
}

// Build for each browser
browsers.forEach(browser => {
  console.log(`📦 Building for ${browser.name.toUpperCase()}...`);
  
  const distDir = `dist/${browser.name}`;
  
  // Clean and create directory
  cleanAndCreateDir(distDir);
  cleanAndCreateDir(path.join(distDir, 'icons'));
  
  // Copy manifest
  const manifestSrc = path.join('src', browser.manifest);
  const manifestDest = path.join(distDir, 'manifest.json');
  copyFile(manifestSrc, manifestDest, `manifest.json (from ${browser.manifest})`);
  
  // Copy core files
  filesToCopy.forEach(file => {
    const src = path.join('src', file);
    const dest = path.join(distDir, file);
    copyFile(src, dest, file);
  });
  
  // Copy icons
  const iconsSrc = path.join('src', 'icons');
  const iconsDest = path.join(distDir, 'icons');
  
  if (copyDirectory(iconsSrc, iconsDest)) {
    const iconFiles = fs.readdirSync(iconsSrc);
    console.log(`  ✅ icons/ (${iconFiles.length} files)`);
  } else {
    console.log(`  ⚠️  icons/ - Directory not found (you need to create icon files)`);
  }
  
  console.log(`  ✅ ${browser.name} build complete\n`);
});

// Summary
console.log('📊 Build Summary:');
browsers.forEach(browser => {
  const distDir = `dist/${browser.name}`;
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    console.log(`  ${browser.name}: ${files.length} files in ${distDir}/`);
  }
});

console.log('\n🎉 Build complete!');
console.log('\n📝 Next steps:');
console.log('  1. Create icon files in src/icons/ (16, 32, 48, 128px)');
console.log('  2. Test extension: Load dist/chrome/ in Chrome developer mode');
console.log('  3. Package for stores: Zip the contents of each dist/ folder');

// Check for common issues
console.log('\n🔍 Checking for common issues...');

const srcDir = 'src';
if (!fs.existsSync(srcDir)) {
  console.log('  ❌ src/ directory not found');
} else {
  console.log('  ✅ src/ directory exists');
}

const requiredFiles = ['manifest-v3.json', 'manifest-v2.json', 'background.js', 'popup.html'];
let missingFiles = [];

requiredFiles.forEach(file => {
  if (!fs.existsSync(path.join(srcDir, file))) {
    missingFiles.push(file);
  }
});

if (missingFiles.length > 0) {
  console.log('  ❌ Missing required files:');
  missingFiles.forEach(file => console.log(`     - ${file}`));
} else {
  console.log('  ✅ All required files present');
}

const iconsDir = path.join(srcDir, 'icons');
if (!fs.existsSync(iconsDir)) {
  console.log('  ⚠️  Create src/icons/ directory with icon files');
} else {
  const iconFiles = fs.readdirSync(iconsDir);
  const requiredIcons = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
  const missingIcons = requiredIcons.filter(icon => !iconFiles.includes(icon));
  
  if (missingIcons.length > 0) {
    console.log(`  ⚠️  Missing icons: ${missingIcons.join(', ')}`);
  } else {
    console.log('  ✅ All required icons present');
  }
}