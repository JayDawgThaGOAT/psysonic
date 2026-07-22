use std::sync::Arc;

use tauri::{AppHandle, Manager};

/// Drain durable identity invalidations left by an interrupted prior process.
/// Active sync orchestrators own post-sync maintenance before emitting idle.
pub fn setup_library_identity_maintenance(app: &AppHandle) {
    if let Some(runtime) = app.try_state::<psysonic_library::LibraryRuntime>() {
        let store = Arc::clone(&runtime.store);
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(error) = psysonic_library::identity::ensure_pending_cluster_keys(&store) {
                crate::app_eprintln!("[library-cluster] startup maintenance failed: {error}");
            }
        });
    }
}
