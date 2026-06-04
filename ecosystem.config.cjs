/**
 * PM2 process manager — IPO Team Manager
 *
 * Setup:
 *   npm install -g pm2
 *   cd backend && npm install && npm run migrate
 *   cd frontend && npm install && npm run build
 *
 * Start (from repo root):
 *   pm2 start ecosystem.config.cjs
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup
 *
 * Logs: pm2 logs | pm2 monit
 */
const path = require('path');

const root = __dirname;
const logsDir = path.join(root, 'logs');

module.exports = {
  apps: [
    {
      name: 'ipo-api',
      cwd: path.join(root, 'backend'),
      script: 'src/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      merge_logs: true,
      time: true,
      error_file: path.join(logsDir, 'ipo-api-error.log'),
      out_file: path.join(logsDir, 'ipo-api-out.log'),
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'ipo-web',
      cwd: path.join(root, 'frontend'),
      script: path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
      args: 'preview --host 0.0.0.0 --port 5173',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      merge_logs: true,
      time: true,
      error_file: path.join(logsDir, 'ipo-web-error.log'),
      out_file: path.join(logsDir, 'ipo-web-out.log'),
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
