// scripts/create-zip.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const browser = process.argv[2];
if (!browser) {
  console.error("Browser not specified");
  process.exit(1);
}

const distDir = `dist/${browser}`;
const releasesDir = "releases";
const zipFile = `cookie-analyzer-${browser}.zip`;

// Create releases directory
fs.mkdirSync(releasesDir, { recursive: true });

// Check if dist directory exists
if (!fs.existsSync(distDir)) {
  console.error(`Error: ${distDir} does not exist. Run build first.`);
  process.exit(1);
}

try {
  // Change to dist directory and create zip
  process.chdir(distDir);

  // Use different zip commands based on platform
  const isWindows = process.platform === "win32";

  if (isWindows) {
    // For Windows, use PowerShell
    execSync(
      `powershell -command "Compress-Archive -Path * -DestinationPath ../../${releasesDir}/${zipFile} -Force"`,
      { stdio: "inherit" }
    );
  } else {
    // For Unix/Linux/Mac
    execSync(`zip -r ../../${releasesDir}/${zipFile} .`, { stdio: "inherit" });
  }

  // Change back to original directory
  process.chdir("../..");

  console.log(`✅ Created ${releasesDir}/${zipFile}`);
} catch (error) {
  console.error("Error creating zip file:", error.message);

  // Alternative: Create a simple directory listing if zip fails
  console.log(
    "Zip creation failed, but files are ready in:",
    path.resolve(distDir)
  );
  console.log("You can manually zip the contents of this directory.");

  process.exit(1);
}
