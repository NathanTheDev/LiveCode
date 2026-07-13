
mod auth;
mod controllers;
use axum::{http::HeaderValue, Router, routing::{get, patch, post}};
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_governor::{governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor, GovernorLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use controllers::hello;
use controllers::notes;
use sqlx::postgres::PgPoolOptions;

pub type Db = sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub internal_api_key: String,
}

async fn init_router() -> Router {
    // GH issue #2 Phase 5: same stub-with-warning pattern as INTERNAL_API_KEY
    // below - keeps bare `cargo run` bootable against the default local
    // Postgres without a `.env`, while anywhere else (Docker, Fly) is expected
    // to set DATABASE_URL explicitly; if it doesn't, connect() below fails
    // loudly rather than silently pointing at the wrong database.
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        eprintln!(
            "WARNING: DATABASE_URL not set - defaulting to local Postgres at \
             localhost:5432/livecode (see GH issue #2 Phase 5)."
        );
        "postgres://postgres:postgres@localhost:5432/livecode".to_string()
    });
    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("failed to connect to Postgres");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("failed to run migrations");

    // GH issue #2 Phase "notes service": this backend is no longer called
    // directly by any browser - only by helm's backend and by ysocket,
    // server-to-server - so a single shared secret replaces the old
    // Firebase-ID-token verification here (that check now lives in helm and
    // in ysocket, which independently gate their own end-user-facing
    // surfaces). Falling back to a dev stub keeps local `cargo run` bootable
    // with no `.env`; ysocket must be configured with the same value.
    let internal_api_key = std::env::var("INTERNAL_API_KEY").unwrap_or_else(|_| {
        eprintln!(
            "WARNING: INTERNAL_API_KEY not set - using dev stub. Every route \
             except /hello will reject callers that don't send the same stub \
             value. Set a real shared secret (matching ysocket's) before any \
             non-local deployment."
        );
        "livecode-dev-stub-internal-key".to_string()
    });

    // GH issue #2 Phase 8: pure JSON/binary API, never renders HTML, so a
    // locked-down `default-src 'none'` CSP is safe (there's no first-party
    // content for a browser to execute/load in the first place - this is
    // defense in depth against a browser ever being tricked into treating a
    // response as renderable content). Paired with nosniff so browsers don't
    // try.
    let security_headers = ServiceBuilder::new()
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::HeaderName::from_static("content-security-policy"),
            HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'"),
        ));

    // GH issue #2 Phase 8: per-caller-IP rate limit on the two routes a
    // caller can spam to do damage (create arbitrary notes, flip
    // is_active). `SmartIpKeyExtractor` reads `X-Forwarded-For` (Fly's proxy
    // sets this), falling back to the peer address - safe here since Fly
    // terminates the client connection itself, so that header can't be
    // spoofed by an external client. Deliberately NOT applied to `/hello`
    // (public health check, not sensitive) or `GET|PUT /notes/:id`
    // (high-frequency internal server-to-server calls from ysocket's
    // persistence/upgrade layer, not end-user traffic - a per-IP limit there
    // would bucket all of ysocket's concurrent multi-note traffic under one
    // IP and throttle legitimate saves, not abuse).
    let rate_limit_conf = GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(10)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("valid governor rate limit config");

    // Route policy (notes-service repurpose, superseding the old
    // per-user-owned-document model): every route below requires the
    // `InternalAuth` shared secret (see auth.rs) except the public health
    // check. There is no per-end-user identity or ownership left in this
    // service at all - that boundary now lives entirely in helm (who may
    // create/publish/close a note) and in ysocket (who may join a note's
    // live WS room).
    //   GET   /hello              public - unrelated health-check-style endpoint
    //   POST  /notes              internal only - called by helm when publishing a note
    //   PATCH /notes/:id/active   internal only - called by helm to open/close a note's link
    //   GET   /notes/:id          internal only - called by ysocket (hydrate + is_active
    //                             check via the `x-note-active` header) and by helm when
    //                             closing a note (to read back the final content)
    //   PUT   /notes/:id          internal only - called by ysocket's persistence layer
    Router::new()
        .route("/notes", post(notes::create_note))
        .route("/notes/:id/active", patch(notes::update_note_active))
        .route_layer(GovernorLayer { config: Arc::new(rate_limit_conf) })
        .route("/hello", get(hello::hello_world))
        .route(
            "/notes/:id",
            get(notes::get_note).put(notes::put_note),
        )
        .with_state(AppState { db, internal_api_key })
        .layer(security_headers)
}

#[tokio::main]
async fn main() {
    // GH issue #2 Phase 5: loads a local `.env` if present, for `cargo run`
    // convenience - never required, since Docker/Fly inject real env vars
    // directly and this silently no-ops if no `.env` file exists.
    dotenvy::dotenv().ok();

    let app = init_router().await;

    // GH issue #2 Phase 5: Fly.io (and most PaaS conventions) assign the
    // listen port via $PORT rather than letting the app hardcode one.
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();

    println!("Server running on http://0.0.0.0:{port}");

    // `into_make_service_with_connect_info` gives the rate limiter's
    // `SmartIpKeyExtractor` a peer address to fall back on if `X-Forwarded-For`
    // is ever absent (see GH issue #2 Phase 8).
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}

