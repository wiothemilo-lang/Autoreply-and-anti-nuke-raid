use std::cmp::min;
use std::io::{self, BufWriter, Read, Write};

struct Name<'a> {
    text: &'a [u8],
    core: &'a [u8],
    digits: usize,
    is_default: bool,
}

impl<'a> Name<'a> {
    fn new(text: &'a str) -> Self {
        let text = text.as_bytes();
        let digits = text.iter().rev().take_while(|b| b.is_ascii_digit()).count();
        let core = &text[..text.len() - digits];
        Self {
            text,
            core,
            digits,
            is_default: core == b"user" && digits > 0,
        }
    }
}

fn distance(a: &[u8], b: &[u8], row: &mut [usize]) -> usize {
    let row = &mut row[..=b.len()];
    for (j, value) in row.iter_mut().enumerate() {
        *value = j;
    }
    for (i, letter) in a.iter().enumerate() {
        let mut diagonal = row[0];
        row[0] = i + 1;
        for (j, other) in b.iter().enumerate() {
            let above = row[j + 1];
            row[j + 1] = (above + 1)
                .min(row[j] + 1)
                .min(diagonal + usize::from(letter != other));
            diagonal = above;
        }
    }
    row[b.len()]
}

fn similarity(left: &Name<'_>, right: &Name<'_>, row: &mut [usize]) -> usize {
    let (a, b) = (left.text, right.text);
    if a.len().min(b.len()) < 5 {
        return 0;
    }
    if a == b {
        return 100;
    }
    if left.is_default || right.is_default {
        return 0;
    }

    let max_len = a.len().max(b.len());
    let base = ((1.0 - distance(a, b, row) as f64 / max_len as f64) * 100.0).round() as usize;
    let prefix = a.iter().zip(b).take(12).take_while(|(x, y)| x == y).count();
    if left.digits > 0 && right.digits > 0 && left.core.len() >= 5 && left.core == right.core {
        return min(100, base + min(6, prefix) + 10);
    }
    if prefix < 5 {
        return min(100, base + prefix);
    }
    let tail_a = a.len() - prefix;
    let tail_b = b.len() - prefix;
    let short_tails = (1..=3).contains(&tail_a) && (1..=3).contains(&tail_b);
    let both_numeric =
        tail_a > 0 && tail_b > 0 && tail_a <= left.digits && tail_b <= right.digits;
    if short_tails && !both_numeric {
        min(80, base)
    } else {
        base
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let threshold: usize = std::env::args().nth(1).ok_or("Thiếu ngưỡng điểm")?.parse()?;
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    // Đầu vào ASCII đã được chuẩn hóa bởi cùng hàm JS dùng cho bản Bun.
    let members: Vec<_> = input
        .lines()
        .map(|line| match line.split_once('\t') {
            Some((user, nick)) => (Name::new(user), Some(Name::new(nick))),
            None => (Name::new(line), None),
        })
        .collect();
    let max_len = members
        .iter()
        .map(|(user, nick)| user.text.len().max(nick.as_ref().map_or(0, |n| n.text.len())))
        .max()
        .unwrap_or(0);
    let mut row = vec![0; max_len + 1];
    let mut out = BufWriter::new(io::stdout().lock());
    for (i, (user_a, nick_a)) in members.iter().enumerate() {
        for (j, (user_b, nick_b)) in members.iter().enumerate().skip(i + 1) {
            // Lấy tín hiệu đầu tiên đạt ngưỡng, đúng thứ tự của bộ quét đang chạy.
            let comparisons = [
                Some((user_a, user_b)),
                nick_a.as_ref().zip(nick_b.as_ref()),
                nick_a.as_ref().map(|name| (name, user_b)),
                nick_b.as_ref().map(|name| (user_a, name)),
            ];
            for (kind, pair) in comparisons.into_iter().enumerate() {
                if let Some((left, right)) = pair {
                    let score = similarity(left, right, &mut row);
                    if score >= threshold {
                        writeln!(out, "{i}\t{j}\t{kind}\t{score}")?;
                        break;
                    }
                }
            }
        }
    }
    out.flush()?;
    Ok(())
}
