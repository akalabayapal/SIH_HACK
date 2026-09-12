from rapidfuzz import process, fuzz

LIMIT = 20
SCORE_CUTOFF = 60

def search(query: str, sql_data):
     short_list = process.extract(query, sql_data, limit=LIMIT, score_cutoff=60)
     return short_list


if __name__ == '__main__':
     sql_results = ["Apple iPhone 15", "Apple iPhone 14 Pro", "Samsung Galaxy S24", "Google Pixel 8"]
     user_query = "iphone15"

     search_result = search(user_query, sql_results)
     print(type(sql_results))
     print(search)