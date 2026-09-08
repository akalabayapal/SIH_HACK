# This file is main api script for backend
import flask
from config_loader import ServerObject

# This gets data from sql and sends it upstream
from adapter import ORM


'''
ORM api references:

1.  add_objects (DO NOT USE IT)
2.  get_all (This gives a total list for all projects with there risks and other data)
3.  get_top_k (This gives top K risks scores (with some basic guardrails))
4.  get_project(code_of_project) (This gives the project details along with monthly history)

'''


app = flask.Flask(__name__)




'''
Hi @Aditya write your backend code here.
Link the entry of the code inside the function.

Centralized run.py will run the server for you by calling this function
'''


serv_details = ServerObject()
def entry():

    app.run(
        host = serv_details.host_backend,
        port=serv_details.port_backend
    )