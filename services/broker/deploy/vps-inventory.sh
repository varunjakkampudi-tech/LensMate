#!/usr/bin/env bash
# Read-only inventory of the Hostinger VPS for the LensMate broker preparation.
#
# Owner runs this on the VPS. It changes nothing: it only lists containers, networks,
# listening ports, memory, disk and the names (not the contents) of proxy config files.
# It never prints environment variables, secrets, or file contents, so the output is safe to share.
#
# Usage (on the VPS, as a user that can run docker and ss):
#   bash vps-inventory.sh > vps-inventory.txt
set -u

section() { printf '\n== %s ==\n' "$1"; }

section "Host and time"
date -u
hostname

section "Memory, CPU and disk"
free -m 2>/dev/null || echo "free: not available"
nproc 2>/dev/null || echo "nproc: not available"
df -h / 2>/dev/null || echo "df: not available"

section "Docker containers (names, images, ports, status; no environment)"
if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}' 2>&1
  section "Docker compose projects"
  docker compose ls 2>&1
  section "Docker networks (names only)"
  docker network ls --format '{{.Name}}\t{{.Driver}}' 2>&1
  section "Docker volumes (names only)"
  docker volume ls --format '{{.Name}}' 2>&1
else
  echo "docker: not installed or not on PATH"
fi

section "Listening TCP ports (is 8080 free?)"
ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null || echo "ss and netstat: not available"

section "Reverse proxy configuration (file names only, contents not read)"
for dir in /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/caddy /etc/traefik /etc/apache2/sites-enabled; do
  if [ -d "$dir" ]; then
    echo "-- $dir"
    ls -1 "$dir" 2>&1
  fi
done
if command -v nginx >/dev/null 2>&1; then
  echo "nginx is installed"
fi
if command -v caddy >/dev/null 2>&1; then
  echo "caddy is installed"
fi

section "Firewall (status only)"
if command -v ufw >/dev/null 2>&1; then
  ufw status 2>&1 | head -n 20
else
  echo "ufw: not installed or not on PATH"
fi

section "Done"
echo "Read-only inventory complete. Nothing was changed."
