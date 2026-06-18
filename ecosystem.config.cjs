module.exports = {
  apps: [
    {
      name: "rison-frontend",
      script: "npm",
      args: "run start",
      cwd: "./",
      watch: false,
      max_memory_restart: "1G",
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
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
