module.exports = {
  apps: [
    {
      name: "rison-frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "/root/resume-screening-app",
      env: {
        PORT: 3000,
        NODE_ENV: "production"
      }
    },
    {
      name: "rison-backend",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/api/server.ts",
      cwd: "/root/resume-screening-app",
      env: {
        PORT: 4000,
        NODE_ENV: "production",
        SKIP_STARTUP_SYNC: "true"
      }
    },
    {
      name: "rison-worker",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/worker/resumeWorker.ts",
      cwd: "/root/resume-screening-app",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
