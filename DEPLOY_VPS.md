# VPS Deployment Guide - Rison AI Resume Screening App

This document outlines how to deploy and manage this Next.js frontend, Express API server, and BullMQ worker stack on a VPS (Ubuntu/Debian) with zero errors.

---

## 🛠️ Option 1: Native Setup with PM2 & Nginx (Recommended)

This approach installs Node.js and PM2 directly on the host machine. It is simple, performs natively, and is easy to debug.

### Step 1: Install System Prerequisites
Log into your VPS and run:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx redis-server

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node -v
npm -v
redis-server --version

# Install PM2 globally
sudo npm install -g pm2
```

### Step 1.5: Secure & Configure Redis (Local VPS Hosting)
If you want to host Redis directly on the VPS:
1. Open the configuration file:
   ```bash
   sudo nano /etc/redis/redis.conf
   ```
2. Modify the configuration to secure access:
   ```conf
   # Bind to 127.0.0.1 if your backend runs on the same VPS.
   # Bind to 0.0.0.0 if you need to access it from Railway/external services.
   bind 127.0.0.1
   
   # Enable password protection (REQUIRED)
   requirepass your_strong_vps_redis_password
   
   # Enable systemd supervision
   supervised systemd
   ```
3. Restart and enable the Redis service:
   ```bash
   sudo systemctl restart redis-server
   sudo systemctl enable redis-server
   ```
4. Verify connectivity:
   ```bash
   redis-cli -a your_strong_vps_redis_password ping
   # Expected output: PONG
   ```
5. Configure Firewall (if binding to 0.0.0.0 for external access):
   Only allow specific trusted IP addresses to connect to port 6379, such as your backend/worker server:
   ```bash
   sudo ufw allow from <backend-server-ip> to any port 6379 proto tcp
   ```

### Step 2: Clone and Configure Project
```bash
# Clone the repository
git clone <your-git-repo-url> /var/www/resume-screening-app
cd /var/www/resume-screening-app

# Install dependencies
npm ci

# Create environment configuration file
cp .env.example .env
nano .env
```
Fill out `.env` with your production variables:
```env
DEEPSEEK_API_KEY=your_production_key
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
DATABASE_URL=postgresql://user:password@host:port/db
# For Native VPS Setup (use the password set in /etc/redis/redis.conf):
REDIS_URL=redis://:your_strong_vps_redis_password@127.0.0.1:6379
# (Or use external host IP if backend runs on Railway and connects to VPS):
# REDIS_URL=redis://:your_strong_vps_redis_password@vps_ip_address:6379
```

### Step 3: Build & Launch with PM2
```bash
# 1. Initialize PostgreSQL database tables
npm run init-db

# 2. Build the Next.js production client bundle
npm run build

# 3. Launch all services (Next.js, Express API, Worker) under PM2
pm2 start ecosystem.config.cjs --env production

# 4. Save the PM2 list and configure to start automatically on system reboot
pm2 save
pm2 startup
```

---

## 🐳 Option 2: Docker Compose Setup

This approach runs the entire application inside isolated Docker containers. No local Node.js installation is required.

### Step 1: Install Docker & Docker Compose
Follow the [official Docker installation steps](https://docs.docker.com/engine/install/ubuntu/).
Once installed, verify:
```bash
docker --version
docker compose version
```

### Step 2: Setup Environment & Launch
```bash
cd /var/www/resume-screening-app

# Create environment file
cp .env.example .env
nano .env
```
Fill out the variables in `.env`.
For the Dockerized Redis setup, you can set the password using `REDIS_PASSWORD` and point the `REDIS_URL` to the `rison-redis` container hostname:
```env
REDIS_PASSWORD=your_strong_vps_redis_password
# Connect using the container name 'rison-redis' inside the Docker network
REDIS_URL=redis://:your_strong_vps_redis_password@rison-redis:6379
```

Build and start all services in detached mode:
```bash
docker compose up --build -d
```
Docker will start all containers including the self-hosted Redis container (`rison-redis`), persist its state in the `redisdata` volume, and start the app services connected to it.

---

## 🔒 Step 4: Reverse Proxy Configuration (Nginx & SSL)

### 1. Link Nginx Configuration
```bash
# Copy example configuration template
sudo cp nginx.conf.example /etc/nginx/sites-available/resume-screening-app

# Edit domain parameters
sudo nano /etc/nginx/sites-available/resume-screening-app

# Enable site configuration and restart Nginx
sudo ln -s /etc/nginx/sites-available/resume-screening-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 2. Install Free SSL certificates (Let's Encrypt Certbot)
```bash
sudo apt install snapd -y
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Request SSL and auto-configure Nginx reverse proxy
sudo certbot --nginx -d app.yourdomain.com -d api.yourdomain.com
```

---

## 📊 Logs Management, Monitoring & Rotation

The application is equipped with a dual logging system on the VPS:
1. **Application-Level Event logs**: Written into `./logs/combined.log` (all events) and `./logs/error.log` (errors only) relative to the project directory.
2. **PM2 Process Console logs**: Output logs from stdout/stderr redirected to service-specific logs:
   - `./logs/pm2-frontend-out.log` / `./logs/pm2-frontend-error.log`
   - `./logs/pm2-backend-out.log` / `./logs/pm2-backend-error.log`
   - `./logs/pm2-worker-out.log` / `./logs/pm2-worker-error.log`

---

### 1. View Logs on the VPS Command Line

You can view application logs directly on the VPS terminal using:
```bash
# View last 100 lines and stream new combined logs
npm run logs:tail

# View last 100 lines and stream new error logs
npm run logs:tail-error
```

To view default PM2 logs:
```bash
# View log streams of all PM2 managed processes
pm2 logs

# View logs of specific process only
pm2 logs rison-backend
```

---

### 2. View Logs via Admin API Endpoint (Secure)

You can view error logs securely from a frontend client dashboard or API client without needing to SSH into the VPS.
* **Endpoint**: `/api/admin/logs`
* **Method**: `GET`
* **Authentication**: Requires session authentication cookies and a user account with the `"owner"` role.
* **Parameters**:
  - `level` (optional): `"error"` (default, reads `error.log`) or `"combined"` (reads `combined.log`)
  - `lines` (optional): Number of recent lines to read. Default is `100` (max `500`).
* **Example curl Request**:
  ```bash
  curl -b cookies.txt https://your-domain.com/api/admin/logs?level=error&lines=50
  ```

---

### 3. Log Rotation (CRITICAL for Production VPS)

By default, PM2 logs can grow indefinitely and consume all available disk space, causing VPS server crashes. Setting up `pm2-logrotate` is highly recommended:

```bash
# Install the logrotate module into PM2
pm2 install pm2-logrotate

# Configure maximum size of a single log file to 10 Megabytes (rotates if exceeded)
pm2 set pm2-logrotate:max_size 10M

# Keep a maximum of 10 rotated log files per service (deletes older ones)
pm2 set pm2-logrotate:retain 10

# Enable compression of rotated log files to save space
pm2 set pm2-logrotate:compress true

# Set how frequently (in seconds) the worker checks file sizes (e.g., 3600 = 1 hour)
pm2 set pm2-logrotate:workerInterval 3600
```

---

## 🛠️ Management & Maintenance Commands

### PM2 Process Checks:
* Check status: `pm2 status`
* Restart all apps: `pm2 restart ecosystem.config.cjs`
* Save active list: `pm2 save`

### Docker Logs & Container Checks (If using Option 2):
* View container logs: `docker compose logs -f`
* Check running containers: `docker ps`
* Stop services: `docker compose down`
