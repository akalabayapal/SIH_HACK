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


class ServerObject:
    def __init__(self):
        with open('config.json','r') as fs:
            obj = json.load(fs)

            self.host_backend =  obj['host_backend']
            self.port_backend  = obj['port_backend']

            self.host_frontend = obj['host_frontend']
            self.port_frontend = obj['port_frontend']


