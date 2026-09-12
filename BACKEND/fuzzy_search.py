from rapidfuzz import process, fuzz

LIMIT = 20
SCORE_CUTOFF = 60

def search(query: str, sql_data):
     return process.extract(query, sql_data, limit=LIMIT, score_cutoff=60)


def filter():
     ...

