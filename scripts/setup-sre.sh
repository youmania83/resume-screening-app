#!/bin/bash
# scripts/setup-sre.sh
# Automation Script for SRE/DevOps provisioning on Ubuntu 24.04 VPS.
# Run on the VPS as root: sudo bash scripts/setup-sre.sh

set -e

echo "================================================================="
echo "⚙️  RISON AI HIRE - SRE & DEVOPS PROVISIONING SCRIPT"
echo "================================================================="

# 1. Update OS package lists
echo "🔄 Updating OS package lists..."
apt-get update && apt-get upgrade -y

# 2. Install Docker & Docker Compose
echo "🐳 Installing Docker and Docker Compose..."
if ! command -v docker &> /dev/null; then
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Set up the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Start and enable docker
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker installed successfully!"
else
    echo "⚠️  Docker is already installed. Skipping installation."
fi

# 3. Install and Configure UFW Firewall
echo "🔒 Installing and configuring UFW firewall..."
apt-get install -y ufw

# Set default policies
ufw default deny incoming
ufw default allow outgoing

# Allow standard public ports
ufw allow 80/tcp comment 'Allow HTTP'
ufw allow 443/tcp comment 'Allow HTTPS'

# Allow SSH connection (change if you use a custom SSH port)
ufw allow 22/tcp comment 'Allow SSH'

# Deny external access to internal database and metrics ports
ufw deny 3000/tcp comment 'Block external Next.js access'
ufw deny 4000/tcp comment 'Block external Backend Express access'
ufw deny 5432/tcp comment 'Block external PostgreSQL access'
ufw deny 6379/tcp comment 'Block external Redis access'
ufw deny 9090/tcp comment 'Block external Prometheus access'
ufw deny 3001/tcp comment 'Block external Grafana access'
ufw deny 3100/tcp comment 'Block external Loki access'
ufw deny 9100/tcp comment 'Block external Node Exporter'
ufw deny 8080/tcp comment 'Block external cAdvisor'

# Enable UFW (run non-interactively)
echo "y" | ufw enable
ufw status verbose
echo "✅ UFW Firewall enabled and hardened!"

# 4. Install and Configure Fail2Ban
echo "🛡️ Installing and configuring Fail2Ban..."
apt-get install -y fail2ban

# Copy jail config
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Enable SSH monitoring jail
cat <<EOF >> /etc/fail2ban/jail.local

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 1h
findtime = 10m
EOF

systemctl restart fail2ban
systemctl enable fail2ban
echo "✅ Fail2Ban active and protecting SSH!"

# 5. SSH Hardening Warning & Instructions
echo "================================================================="
echo "🔒 WARNING: SSH HARDENING REQUIRED"
echo "================================================================="
echo "To prevent unauthorized brute force logins:"
echo "1. Verify you have installed your public SSH key on this VPS."
echo "2. Edit the SSH daemon configuration file:"
echo "   sudo nano /etc/ssh/sshd_config"
echo "3. Modify the following parameters:"
echo "   PasswordAuthentication no"
echo "   PermitRootLogin prohibit-password (or 'no' if you have a deploy user)"
echo "4. Restart the SSH service:"
echo "   sudo systemctl restart sshd"
echo "================================================================="

echo "🎉 SRE Infrastructure Hardening Complete!"
