#!/usr/bin/env bash
# change の成果物に、apply へ判断を回す言葉が残っていないかを探す。
# 使い方: check-undecided.sh <changeRoot>
# 当たった行を出して終了コード 1 で終わる。何も当たらなければ 0、対象がなければ 2。
# sketch/ は除く。型のスケッチは、形を決めたうえで本体を `// TODO` の擬似コードにする決まりのため。
# Review Record の節も除く。レビューの経過を書く節で、「未解決の判断は0件」「apply時の実測は実装タスク」のように判断が残っていないことを述べるため。
set -euo pipefail

root="${1:?使い方: check-undecided.sh <changeRoot>}"
if [ ! -d "$root" ]; then
  echo "ディレクトリがない: $root" >&2
  exit 2
fi

pattern='TBD|TODO|FIXME|未定|未決|未確定|仮置き|仮に|暫定|とりあえず|要検討|要確認|要調整|検討する|調整する|(後|あと)で(決|調整|判断)|測って決|(方式|方法|形|値)を選ぶ|apply ?(時|の(中|途中|際))|apply ?で(決|調整|判断|測|選)|実装(時|中)(に|の)?(決|判断|調整|選)'

found=0
while IFS= read -r -d '' file; do
  # Review Record の見出しから、同じか上の階層の次の見出しまでを空行にして、行番号を保ったまま検査する。
  if awk '
    /^#+[[:space:]]/ {
      level = match($0, /[^#]/) - 1
      if (skip && level <= skip) skip = 0
      if (!skip && $0 ~ /^#+[[:space:]]+Review Record/) skip = level
    }
    { print (skip ? "" : $0) }
  ' "$file" | grep -niE "$pattern" | sed "s|^|$file:|"; then
    found=1
  fi
done < <(find "$root" -type d -name sketch -prune -o -type f -print0)

if [ "$found" -eq 1 ]; then
  exit 1
fi
exit 0
