#!/usr/bin/env bash
# change の成果物に、apply へ判断を回す言葉が残っていないかを探す。
# 使い方: check-undecided.sh <changeRoot>
# 当たった行を出して終了コード 1 で終わる。何も当たらなければ 0、対象がなければ 2。
# sketch/ は除く。型のスケッチは、形を決めたうえで本体を `// TODO` の擬似コードにする決まりのため。
set -euo pipefail

root="${1:?使い方: check-undecided.sh <changeRoot>}"
if [ ! -d "$root" ]; then
  echo "ディレクトリがない: $root" >&2
  exit 2
fi

pattern='TBD|TODO|FIXME|未定|未決|未確定|仮置き|仮に|暫定|とりあえず|要検討|要確認|要調整|検討する|調整する|(後|あと)で(決|調整|判断)|測って決|(方式|方法|形|値)を選ぶ|apply ?(時|の(中|途中|際))|apply ?で(決|調整|判断|測|選)|実装(時|中)(に|の)?(決|判断|調整|選)'

if grep -rniE --exclude-dir=sketch "$pattern" "$root"; then
  exit 1
fi
exit 0
