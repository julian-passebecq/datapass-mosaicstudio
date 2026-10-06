# ILLUSTRATIVE readings. Traced line by line
# by py/coding_lab_trace.py (sys.settrace).


def normalize(value, lo, hi):
    return round((value - lo) / (hi - lo), 3)


rows = [12.0, 30.0, 21.0, 48.0]
lo, hi = min(rows), max(rows)
results = []
total = 0.0
for item in rows:
    transformed = normalize(item, lo, hi)
    results.append(transformed)
    total += transformed
mean = round(total / len(results), 3)
