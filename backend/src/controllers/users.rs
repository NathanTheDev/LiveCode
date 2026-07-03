use axum::{response::IntoResponse, Json};

use crate::auth::AuthUser;

pub async fn get_me(user: AuthUser) -> impl IntoResponse {
    Json(user)
}
