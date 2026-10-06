import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Custom plugin to strictly prevent unwanted page reloads when non-frontend files change
function preventUnwantedReloadsPlugin() {
  return {
    name: 'prevent-unwanted-reloads',
    handleHotUpdate({ file }) {
      const normalized = file.replace(/\\/g, '/');
      // Strictly only allow HMR updates for source code in /src/ or index.html
      const isSrcFile = normalized.includes('/src/');
      const isHtml = normalized.endsWith('index.html');

      if (!isSrcFile && !isHtml) {
        // Returning an empty array tells Vite: "This change is handled, do not send a full-reload to the browser!"
        return [];
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), preventUnwantedReloadsPlugin()],
  server: {
    watch: {
      // Windows backslash & POSIX forward-slash regex ignores for OneDrive & external tools
      ignored: [
        /[\\/]apps-script[\\/]/,
        /[\\/]dist[\\/]/,
        /[\\/]\.git[\\/]/,
        /[\\/]\.firebase[\\/]/,
        /[\\/]\.vscode[\\/]/,
        /[\\/]node_modules[\\/]/,
        /[\\/]\.sync[\\/]/,
        /[\\/]\.tmp[\\/]/,
        /~\$/,
        /\.tmp$/,
        /\.temp$/,
        /\.md$/,
        (path) => {
          if (typeof path !== 'string') return false;
          const norm = path.replace(/\\/g, '/');
          return (
            norm.includes('/apps-script/') ||
            norm.includes('/dist/') ||
            norm.includes('/.firebase/') ||
            norm.includes('/.git/') ||
            norm.includes('/node_modules/') ||
            norm.includes('/.sync/') ||
            norm.includes('~$') ||
            norm.endsWith('.tmp') ||
            norm.endsWith('.temp') ||
            norm.endsWith('.md')
          );
        }
      ]
    },
    hmr: {
      overlay: false,
      timeout: 600000
    }
  }
})
