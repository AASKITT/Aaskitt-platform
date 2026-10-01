const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'aaskitt-app', 'dist');

// 1. Copy _expo to expo-assets
const oldExpoDir = path.join(distDir, '_expo');
const newExpoDir = path.join(distDir, 'expo-assets');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(oldExpoDir)) {
  copyDir(oldExpoDir, newExpoDir);
  console.log('✅ Copied _expo -> expo-assets');
}

// 2. Replace all references to /_expo/ with /expo-assets/
function replaceInDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      replaceInDir(fullPath);
    } else if (entry.name.endsWith('.html') || entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('/_expo/') || content.includes('_expo/')) {
        content = content.replace(/\/_expo\//g, '/expo-assets/').replace(/_expo\//g, 'expo-assets/');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('✅ Updated file:', entry.name);
      }
    }
  }
}

replaceInDir(distDir);

// 3. Write bulletproof .htaccess
const htaccessContent = `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # 1. Allow direct access to expo-assets and all static files
  RewriteRule ^expo-assets/ - [L]
  RewriteRule ^_expo/ - [L]
  RewriteRule ^assets/ - [L]
  RewriteRule ^favicon\.ico$ - [L]
  RewriteRule ^favicon\.png$ - [L]
  RewriteRule \\.(js|mjs|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|eot|map)$ - [L]

  # 2. Existing files or directories
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # 3. SPA Route Fallback: Rewrite all paths to index.html
  RewriteRule ^ index.html [L]
</IfModule>

<IfModule mod_mime.c>
  AddType application/javascript .js .mjs
  AddType text/css .css
  AddType image/svg+xml .svg
  AddType image/x-icon .ico
  AddType image/png .png
  AddType application/json .json
</IfModule>
`;

fs.writeFileSync(path.join(distDir, '.htaccess'), htaccessContent, 'utf8');
console.log('✅ Updated .htaccess successfully!');
