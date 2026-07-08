# GH issue #2 Phase 5: Fly.io-compatible image for the Rust/Axum backend -
# small runtime image, single exposed port that respects $PORT, non-root.

FROM rust:1-bookworm AS builder
WORKDIR /app

# Cache dependency compilation separately from source changes: build once
# against a dummy main.rs so `cargo build` resolves and compiles
# dependencies into a layer that's only invalidated by Cargo.toml/Cargo.lock,
# not by every source edit.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src

COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim

# ca-certificates: needed for TLS to Postgres (Neon) and Google's JWKS
# endpoint - both are plain HTTPS/TLS calls, no other runtime libs required
# since sqlx/reqwest are built against rustls, not system OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --no-create-home --shell /usr/sbin/nologin appuser

WORKDIR /app
COPY --from=builder /app/target/release/backend ./backend
COPY --from=builder /app/migrations ./migrations

USER appuser

ENV PORT=8080
EXPOSE 8080

CMD ["./backend"]
