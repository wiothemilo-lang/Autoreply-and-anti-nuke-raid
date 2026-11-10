module.exports = {
  apps: [
    {
      name: "protogon-bot",
      script: "src/index.js",
      cwd: __dirname,
      // 🚀 VPS mạnh (32GB RAM, 6 CPU) — không cần giới hạn bộ nhớ
      // Auto-restart khi crash
      exp_backoff_restart_delay: 100,
      // Logs
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "data/logs/error.log",
      out_file: "data/logs/out.log",
      merge_logs: true,
      max_restarts: 10,
      min_uptime: "10s",
      // Environment
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
