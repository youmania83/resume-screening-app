module.exports = {
  apps: [
    {
      name: "rison-frontend",
      script: "npm",
      args: "run start",
      cwd: "./",
      watch: false,
      max_memory_restart: "1G",
      error_file: "./logs/pm2-frontend-error.log",
      out_file: "./logs/pm2-frontend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
    {
      name: "rison-backend",
      script: "npx",
      args: "tsx src/api/server.ts",
      cwd: "./",
      watch: false,
      max_memory_restart: "1G",
      error_file: "./logs/pm2-backend-error.log",
      out_file: "./logs/pm2-backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env_production: {
        NODE_ENV: "production",
        PORT: 4000
      }
    },
    {
      name: "rison-worker",
      script: "npx",
      args: "tsx src/worker/resumeWorker.ts",
      cwd: "./",
      watch: false,
      max_memory_restart: "1G",
      error_file: "./logs/pm2-worker-error.log",
      out_file: "./logs/pm2-worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
