#!/usr/bin/env bash
set -euo pipefail
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker "$USER"
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save || true
IP=$(curl -fs https://api.ipify.org)
echo "Public IP: $IP"
echo "Use KEEL_HOST=keel-$(echo "$IP" | tr . -).sslip.io"
