# This file is main api script for backend
import flask
from config_loader import ServerObject

# This gets data from sql and sends it upstream
from adapter import ORM,Trainer


'''
ORM api references:

1.  add_objects (DO NOT USE IT)
2.  get_all (This gives a total list for all projects with there risks and other data) (list[dict])
3.  get_top_k (This gives top K risks scores (with some basic guardrails)) (list[dict])
4.  get_project(code_of_project) (This gives the project details along with monthly history) (dict)
5.  llm_query(project_data_returned_by_get_project) (This query llm and returns comprehensive reasoning of the trend) (dict)
6.  get_stats() (This gives you the stats of the project overall) (dict)

Trainer API references

1. retrain_model(new_model_file) (Retrains the model with new data and updates the scores this returns job id of the work)
2. get_status(uid) => bool (True == > running training,False:training done)
'''

# Initalisation of the needed classes

orm = ORM()
tr = Trainer()

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