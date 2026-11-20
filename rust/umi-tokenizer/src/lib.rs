//! Node-API bindings generated from the signatures in `port.rs` by rust-anything.

use napi_derive::napi;

pub mod port;

fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|s| (*s).to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "unknown panic".into())
}

#[allow(dead_code)]
fn run<T>(f: impl FnOnce() -> Result<T, String>) -> napi::Result<T> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(result) => result.map_err(napi::Error::from_reason),
        Err(payload) => Err(napi::Error::from_reason(format!(
            "Rust panic: {}",
            panic_message(&*payload)
        ))),
    }
}

/// `countTokenPieces`.
#[napi(js_name = "countTokenPieces")]
pub fn count_token_pieces(pieces: Vec<String>) -> napi::Result<f64> {
    run(move || {
        let out = port::count_token_pieces(pieces)?;
        Ok(out)
    })
}
