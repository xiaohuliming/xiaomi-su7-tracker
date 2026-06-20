import pandas as pd, glob
from collections import Counter

files = sorted(glob.glob("uploads/*.xlsx"))
seen = set(); rows = []; skipped = 0
for f in files:
    try:
        df = pd.read_excel(f)
    except Exception:
        continue
    for _, r in df.iterrows():
        try:
            od, dd = r.get('预约日期'), r.get('下线日期')
            prov, model = r.get('地区'), r.get('车型')
            ext, int_ = r.get('外观颜色'), r.get('内饰颜色')
            uid, wait = r.get('ID'), r.get('等待')
            if any(pd.isna(x) for x in (od, dd, prov, model, ext, int_)):
                skipped += 1; continue
            od = pd.to_datetime(od).strftime('%Y-%m-%d')
            dd = pd.to_datetime(dd).strftime('%Y-%m-%d')
            prov, model = str(prov).strip(), str(model).strip()
            ext, int_ = str(ext).strip(), str(int_).strip()
            wait = (pd.to_datetime(dd) - pd.to_datetime(od)).days if pd.isna(wait) else int(wait)
            uid = None if pd.isna(uid) else str(uid).strip()
            key = (od, dd, prov, model, ext, int_, uid, wait)
            if key in seen: continue
            seen.add(key); rows.append(key)
        except Exception:
            skipped += 1; continue

def esc(s):
    return 'NULL' if s is None else "'" + str(s).replace('\\','\\\\').replace("'","\\'") + "'"

with open("/tmp/su7_rebuild.sql", "w") as w:
    w.write("USE su7_tracker;\nSET NAMES utf8mb4;\n")
    B = 500
    for i in range(0, len(rows), B):
        w.write("INSERT INTO delivery_records (order_date,delivery_date,province,model_type,exterior_color,interior_color,user_id,waiting_days,status) VALUES\n")
        w.write(",\n".join(
            f"({esc(od)},{esc(dd)},{esc(prov)},{esc(model)},{esc(ext)},{esc(int_)},{esc(uid)},{wait},'delivered')"
            for (od,dd,prov,model,ext,int_,uid,wait) in rows[i:i+B]) + ";\n")

print("files:", len(files), "| unique rows:", len(rows), "| skipped:", skipped)
if rows:
    ods = sorted(r[0] for r in rows)
    print("order_date:", ods[0], "->", ods[-1])
    print("models:", Counter(r[3] for r in rows).most_common(6))
    print("provinces:", len(set(r[2] for r in rows)))
