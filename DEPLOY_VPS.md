# VPS Deployment Guide - Rison AI Resume Screening App

This document outlines how to deploy and manage this Next.js frontend, Express API server, and BullMQ worker stack on a VPS (Ubuntu/Debian) with zero errors.

---

## 🛠️ Option 1: Native Setup with PM2 & Nginx (Recommended)

This approach installs Node.js and PM2 directly on the host machine. It is simple, performs natively, and is easy to debug.

### Step 1: Install System Prerequisites
Log into your VPS and run:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node -v
npm -v

# Install PM2 globally
sudo npm install -g pm2
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
REDIS_URL=redis://user:password@host:port
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

# Build and start all services in detached mode
docker compose up --build -d
```
Docker will pull Node-Alpine, build the Next.js static files, and start all three containers (`rison-frontend`, `rison-backend`, `rison-worker`).

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

## 📊 Management & Maintenance Commands

### PM2 Logs & Process Checks:
* View logs: `pm2 logs`
* Check status: `pm2 status`
* Restart all apps: `pm2 restart ecosystem.config.cjs`

### Docker Logs & Container Checks:
* View container logs: `docker compose logs -f`
* Check running containers: `docker ps`
* Stop services: `docker compose down`
