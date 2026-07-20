use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, Listener, Manager};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncIdlePayload {
    server_id: String,
    ok: bool,
}

/// Consume durable identity invalidations even when no webview page is mounted.
pub fn setup_library_sync_idle_listener(app: &AppHandle) {
    if let Some(runtime) = app.try_state::<psysonic_library::LibraryRuntime>() {
        let store = Arc::clone(&runtime.store);
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(error) = psysonic_library::identity::ensure_pending_cluster_keys(&store) {
                crate::app_eprintln!("[library-cluster] startup maintenance failed: {error}");
            }
        });
    }

    let app_handle = app.clone();
    let _ = app.listen(
        psysonic_library::LibrarySyncProgressPayload::IDLE_EVENT_NAME,
        move |event| {
            let Ok(payload) = serde_json::from_str::<SyncIdlePayload>(event.payload()) else {
                return;
            };
            if !payload.ok {
                return;
            }
            let Some(runtime) = app_handle.try_state::<psysonic_library::LibraryRuntime>() else {
                return;
            };
            let store = Arc::clone(&runtime.store);
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(error) =
                    psysonic_library::identity::ensure_cluster_keys_built(&store, &payload.server_id)
                {
                    crate::app_eprintln!(
                        "[library-cluster] sync-idle maintenance failed server_id={}: {}",
                        payload.server_id,
                        error
                    );
                }
            });
        },
    );
}
