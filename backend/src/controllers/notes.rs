use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::auth::InternalAuth;
use crate::AppState;

#[derive(Serialize, sqlx::FromRow)]
pub struct NoteSummary {
    id: String,
    is_active: bool,
}

// Every route in this file is server-to-server only (called by helm's
// backend or by ysocket's persistence/WS-upgrade layer), never directly by
// an end-user browser - so `InternalAuth` (a shared secret, see auth.rs)
// gates all of it. The actual per-user access-control boundary for live
// editing lives in ysocket's WS upgrade handler and helm's own auth gate.
pub async fn create_note(
    State(state): State<AppState>,
    _auth: InternalAuth,
    body: Bytes,
) -> impl IntoResponse {
    let id = uuid::Uuid::new_v4().to_string();
    let seed = body.to_vec();

    let result = sqlx::query_as::<_, NoteSummary>(
        "INSERT INTO notes (id, ydoc_state) VALUES ($1, $2) RETURNING id, is_active",
    )
    .bind(&id)
    .bind(&seed)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(note) => (StatusCode::CREATED, Json(note)).into_response(),
        Err(err) => {
            eprintln!("failed to create note: {err}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct UpdateActiveBody {
    active: bool,
}

pub async fn update_note_active(
    State(state): State<AppState>,
    _auth: InternalAuth,
    Path(id): Path<String>,
    Json(body): Json<UpdateActiveBody>,
) -> impl IntoResponse {
    let result = sqlx::query("UPDATE notes SET is_active = $2, updated_at = now() WHERE id = $1")
        .bind(&id)
        .bind(body.active)
        .execute(&state.db)
        .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            eprintln!("failed to update note {id} active state: {err}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(sqlx::FromRow)]
struct NoteRow {
    ydoc_state: Option<Vec<u8>>,
    is_active: bool,
}

// Raw ydoc bytes. Called by ysocket on every WS upgrade attempt (to hydrate
// + check `is_active` via the `x-note-active` response header below - Axum
// serves HEAD requests off this same GET handler, header-only, which is
// what ysocket uses for the cheap per-connection active check) and by helm
// when closing a published note's link.
pub async fn get_note(
    State(state): State<AppState>,
    _auth: InternalAuth,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let row = sqlx::query_as::<_, NoteRow>(
        "SELECT ydoc_state, is_active FROM notes WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(note)) => (
            StatusCode::OK,
            [("x-note-active", note.is_active.to_string())],
            note.ydoc_state.unwrap_or_default(),
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            eprintln!("failed to load note {id}: {err}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// Same trust boundary as get_note above. Plain UPDATE (not upsert) - a note
// row only ever comes into existence via create_note, so a PUT for an
// unknown id means a bug upstream, not a valid "create on write" path.
pub async fn put_note(
    State(state): State<AppState>,
    _auth: InternalAuth,
    Path(id): Path<String>,
    body: Bytes,
) -> impl IntoResponse {
    let result = sqlx::query("UPDATE notes SET ydoc_state = $2, updated_at = now() WHERE id = $1")
        .bind(&id)
        .bind(body.as_ref())
        .execute(&state.db)
        .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT,
        Ok(_) => StatusCode::NOT_FOUND,
        Err(err) => {
            eprintln!("failed to persist note {id}: {err}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}
