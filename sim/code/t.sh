# usage: t.sh name N [extra json]
cd /workspace/memecoin-v3/sim; export CURVE=pf; d=../out/OBS/$1; mkdir -p $d
X=${3:-'{}'}; KN=$(python3 -c "import json,sys;a={'A0_half':40,'beta':0.004,'pat_xm':10,'k_buzz':0.25,'size_mult':30};a.update(json.loads(sys.argv[1]));print(json.dumps(a))" "$X")
OBSK="$KN" METRICS=1 N=$2 OUT=$d/data.json bun obs-run.ts > $d/m.txt 2>&1; python3 -c "
import json;m=json.load(open('$d/m.txt'));print('$1',{k:m[k] for k in ['btt','p95_5m','grad','rand','labels','peakByLabel','clue','pnd','shill']})"
python3 plot_hd.py --data $d/data.json --out $d/hd --overview >/dev/null 2>&1
