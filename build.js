const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const workspaceDir = __dirname;
const distDir = path.join(workspaceDir, 'dist');
const chromeDist = path.join(distDir, 'chrome');
const firefoxDist = path.join(distDir, 'firefox');

function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
}

function copyFileSync(source, target) {
  let targetFile = target;
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }
  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source, target) {
  let files = [];
  const targetFolder = path.join(target, path.basename(source));
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach((file) => {
      const curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

console.log('🧹 Cleaning old build outputs...');
deleteFolderRecursive(distDir);

console.log('📁 Creating distribution directories...');
fs.mkdirSync(chromeDist, { recursive: true });
fs.mkdirSync(firefoxDist, { recursive: true });

console.log('⚙️ Copying Chrome manifest...');
fs.copyFileSync(
  path.join(workspaceDir, 'manifest.chrome.json'),
  path.join(chromeDist, 'manifest.json')
);

console.log('⚙️ Copying Firefox manifest...');
fs.copyFileSync(
  path.join(workspaceDir, 'manifest.firefox.json'),
  path.join(firefoxDist, 'manifest.json')
);

const foldersToCopy = ['src', 'icons'];
foldersToCopy.forEach((folder) => {
  const folderPath = path.join(workspaceDir, folder);
  if (fs.existsSync(folderPath)) {
    console.log(`📦 Copying ${folder} folder to Chrome distribution...`);
    copyFolderRecursiveSync(folderPath, chromeDist);
    console.log(`📦 Copying ${folder} folder to Firefox distribution...`);
    copyFolderRecursiveSync(folderPath, firefoxDist);
  }
});

// Cross-platform zipping support for automated packing (supports local Windows and Linux CI/CD)
try {
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    console.log('🤐 Zipping packages for distribution using Windows native tar...');
    execSync(`tar -a -c -f "${path.join(distDir, 'savegpt-chrome-edge.zip')}" manifest.json src icons`, { cwd: chromeDist });
    console.log('✅ Created savegpt-chrome-edge.zip');
    
    execSync(`tar -a -c -f "${path.join(distDir, 'savegpt-firefox.zip')}" manifest.json src icons`, { cwd: firefoxDist });
    console.log('✅ Created savegpt-firefox.zip');
  } else {
    console.log('🤐 Zipping packages for distribution using standard zip command (Unix/CI)...');
    execSync(`zip -q -r "${path.join(distDir, 'savegpt-chrome-edge.zip')}" manifest.json src icons`, { cwd: chromeDist });
    console.log('✅ Created savegpt-chrome-edge.zip');
    
    execSync(`zip -q -r "${path.join(distDir, 'savegpt-firefox.zip')}" manifest.json src icons`, { cwd: firefoxDist });
    console.log('✅ Created savegpt-firefox.zip');
  }
} catch (e) {
  console.warn('⚠️ Warning: Automatic zipping failed. Please zip manually.', e.message);
}

console.log('🎉 Build complete! Deployable folders are in dist/chrome and dist/firefox.');
