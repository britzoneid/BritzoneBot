# Docker Deployment Guide

This guide covers building and running BritzoneBot using Docker with a secure, rootless setup.

## 🏗️ Architecture Overview

The Docker setup uses:
- **Multi-stage build**: Separate builder and production stages for minimal final image size
- **Non-root user**: Runs as `botuser` (UID/GID 1000) for security
- **Alpine Linux**: Minimal base image (~40MB compressed)
- **Production dependencies only**: Reduced attack surface and image size
- **Read-only root filesystem**: Enhanced security
- **Resource limits**: Prevents resource exhaustion
- **Persistent state**: Volume mount for `/app/data`

## 📋 Prerequisites

1. **Docker installed in rootless mode** (already done on your system)
2. **docker-compose** or **docker compose** plugin (optional - see alternative below)
3. **Environment variables** configured in `.env` file

## 🚀 Quick Start

### Option A: Using docker-compose (if available)

### 1. Ensure `.env` file exists

```bash
cp .env.example .env
# Edit .env with your bot credentials
```

Your `.env` should contain:
```env
BOT_ID=your-bot-id
TOKEN=your-bot-token
```

### 2. Build and run the container

```bash
# Build the image
docker compose build

# Start the bot in detached mode
docker compose up -d

# View logs
docker compose logs -f britzone-bot
```

### 3. Verify the bot is running

```bash
# Check container status
docker compose ps

# Check bot logs
docker compose logs britzone-bot
```

### Option B: Using plain Docker (no docker-compose needed)

### 1. Ensure `.env` file exists

```bash
cp .env.example .env
# Edit .env with your bot credentials
```

### 2. Build the image

```bash
docker build -t britzone-bot:latest .
```

### 3. Run the container

```bash
# Create data directory if it doesn't exist
mkdir -p ./data

# Run the container
docker run -d \
  --name britzone-bot \
  --restart unless-stopped \
  --env-file .env \
  --security-opt no-new-privileges:true \
  --read-only \
  --tmpfs /tmp:mode=1777,size=100M \
  -v "$(pwd)/data:/app/data" \
  --memory=512m \
  --cpus=1.0 \
  britzone-bot:latest
```

### 4. Verify and manage the container

```bash
# View logs
docker logs -f britzone-bot

# Check status
docker ps -f name=britzone-bot

# Stop the bot
docker stop britzone-bot

# Start the bot again
docker start britzone-bot

# Restart the bot
docker restart britzone-bot

# Remove the container (stop it first)
docker stop britzone-bot
docker rm britzone-bot
```

## 🎯 Common Operations

### Build the image

```bash
# Build with no cache (fresh build)
docker compose build --no-cache

# Build with specific BuildKit features
DOCKER_BUILDKIT=1 docker compose build
```

### Start/Stop the bot

```bash
# Start in background
docker compose up -d

# Stop the bot
docker compose down

# Restart the bot
docker compose restart
```

### View logs

```bash
# Follow logs in real-time
docker compose logs -f

# View last 100 lines
docker compose logs --tail=100

# View logs with timestamps
docker compose logs -t
```

### Update the bot

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose up -d --build
```

### Access container shell (debugging)

```bash
# Open shell as botuser
docker compose exec britzone-bot sh

# Open shell as root (troubleshooting only)
docker compose exec --user root britzone-bot sh
```

## 🔒 Security Features

1. **Non-root user**: Container runs as UID/GID 1000
2. **Read-only root filesystem**: Only `/tmp` and `/app/data` are writable
3. **No new privileges**: Prevents privilege escalation
4. **Resource limits**: CPU and memory caps prevent DoS
5. **Minimal base image**: Smaller attack surface
6. **No exposed ports**: Bot communicates outbound only to Discord

## 📊 Resource Management

Default resource limits (edit `docker-compose.yml` to adjust):

```yaml
limits:
  cpus: '1.0'      # Maximum 1 CPU core
  memory: 512M     # Maximum 512MB RAM

reservations:
  cpus: '0.25'     # Guaranteed 0.25 CPU core
  memory: 128M     # Guaranteed 128MB RAM
```

To monitor resource usage:

```bash
docker stats britzone-bot
```

## 💾 Data Persistence

The `./data` directory is mounted to `/app/data` inside the container for state persistence:

```yaml
volumes:
  - ./data:/app/data
```

This ensures your bot's state (session management, progress tracking) persists across container restarts.

## 🐛 Troubleshooting

### Container won't start

```bash
# Check logs for errors
docker compose logs britzone-bot

# Check container status
docker compose ps

# Verify environment variables
docker compose config
```

### Permission issues with data directory

```bash
# Ensure proper ownership (rootless Docker uses your UID)
chown -R $(id -u):$(id -g) ./data
```

### Bot can't connect to Discord

1. Verify `.env` credentials are correct
2. Check network connectivity:
   ```bash
   docker compose exec britzone-bot ping -c 3 discord.com
   ```
3. Review Discord API status: https://discordstatus.com/

### Out of memory errors

Increase memory limit in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 1G  # Increase to 1GB
```

## 🔄 Development Workflow

For development, you may want to mount the source code:

```yaml
# Add to docker-compose.yml under volumes:
volumes:
  - ./data:/app/data
  - ./src:/app/src  # Mount source for hot-reload
```

Or use the dev script directly without Docker:

```bash
bun dev
```

## 📝 CI/CD Integration

Example GitHub Actions workflow:

```yaml
- name: Build Docker image
  run: docker build -t britzone-bot:${{ github.sha }} .

- name: Run tests in container
  run: docker run --rm britzone-bot:${{ github.sha }} bun test

- name: Push to registry
  run: |
    docker tag britzone-bot:${{ github.sha }} registry.example.com/britzone-bot:latest
    docker push registry.example.com/britzone-bot:latest
```

## 🆘 Support

- **Container issues**: Check Docker logs with `docker compose logs`
- **Bot issues**: Review application logs in `/app/data` (if configured)
- **Discord API issues**: Check https://discord.com/developers/docs

## 📚 Additional Resources

- [Docker Rootless Mode](https://docs.docker.com/engine/security/rootless/)
- [Docker Compose CLI](https://docs.docker.com/compose/reference/)
- [Discord.js Documentation](https://discord.js.org/)
- [Bun Runtime](https://bun.sh/docs)
