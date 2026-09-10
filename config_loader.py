# to load the sql
import json

class SqlObject:
    def __init__(self):
        with open('config.json','r') as fs:
            obj = json.load(fs)

            self.host = obj['host']
            self.user = obj['user']
            self.password = obj['password']
            self.database = obj['database']

            self.gem_key = obj['gemini_key']


class ServerObject:
    def __init__(self):
        with open('config.json','r') as fs:
            obj = json.load(fs)

            self.host_backend =  obj['host_backend']
            self.port_backend  = obj['port_backend']

            self.host_frontend = obj['host_frontend']
            self.port_frontend = obj['port_frontend']

class ModelObject:
    def __init__(self):
        with open('config.json','r') as fs:
            obj = json.load(fs)

            self.raw_pdf =  obj['raw_pdf']
            self.raw_csv  = obj['raw_csv']

            self.p_csv = obj['p_csv']
            self.master_csv = obj['master_csv']

            self.cost_data = obj['cost_data']
            self.time_data = obj['time_data']

            


