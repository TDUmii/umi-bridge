//! Count BPE merges on pieces split by the original ECMAScript tokenizer.

#![deny(unsafe_code)]

use rustc_hash::FxHashMap;
use std::sync::OnceLock;
use tiktoken_rs::{Rank, byte_pair_split};

type Ranks = FxHashMap<Vec<u8>, Rank>;

fn ranks() -> Result<&'static Ranks, String> {
    static RANKS: OnceLock<Result<Ranks, String>> = OnceLock::new();
    RANKS
        .get_or_init(|| {
            let bpe = tiktoken_rs::o200k_base().map_err(|error| error.to_string())?;
            (0..199_998)
                .map(|rank| {
                    bpe.decode_bytes(&[rank])
                        .map(|bytes| (bytes, rank))
                        .map_err(|error| error.to_string())
                })
                .collect()
        })
        .as_ref()
        .map_err(Clone::clone)
}

pub fn count_token_pieces(pieces: Vec<String>) -> Result<f64, String> {
    let ranks = ranks()?;
    let count: usize = pieces
        .iter()
        .map(|piece| {
            let bytes = piece.as_bytes();
            if bytes.len() <= 1 || ranks.contains_key(bytes) {
                usize::from(!bytes.is_empty())
            } else {
                byte_pair_split(bytes, ranks).len()
            }
        })
        .sum();
    Ok(count as f64)
}

#[cfg(test)]
mod tests {
    use super::count_token_pieces;

    #[test]
    fn counts_empty_and_preserves_piece_boundaries() {
        assert_eq!(count_token_pieces(vec![]), Ok(0.0));
        assert_eq!(
            count_token_pieces(vec!["hello".into(), " world".into()]),
            Ok(2.0)
        );
        assert_eq!(count_token_pieces(vec!["a".into(), "b".into()]), Ok(2.0));
    }
}
