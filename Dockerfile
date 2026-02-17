# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Builder - Build TypeScript source
# ============================================
FROM oven/bun:1.3-alpine AS builder

# Set working directory
WORKDIR /build

# Copy dependency manifests first (better layer caching)
COPY package.json bun.lock ./

# Install ALL dependencies (including devDependencies for TypeScript)
RUN bun install --frozen-lockfile

# Copy source code and configuration
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript to JavaScript
RUN bun run build

# ============================================
# Stage 2: Production - Minimal runtime image
# ============================================
FROM oven/bun:1.3-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Note: Base image already has 'bun' user with UID 1000, which matches most host users for rootless Docker

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock ./

# Install ONLY production dependencies
RUN bun install --frozen-lockfile --production && \
    bun pm cache rm

# Copy built artifacts from builder stage
COPY --from=builder /build/dist ./dist

# Create data directory for persistent state
RUN mkdir -p /app/data && \
    chown -R bun:bun /app

# Switch to non-root user (bun user from base image, UID 1000)
USER bun

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run the bot
CMD ["bun", "start"]
