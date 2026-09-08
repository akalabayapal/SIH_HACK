# This file is main api script for backend
import flask
from config_loader import ServerObject



app = flask.Flask(__name__,static_folder='FRONTEND', static_url_path='/')




'''
This is the flask config for @Shubham_Das. Please do not change this file
For running whole project execute 

`python run.py` in the root folder
'''


serv_details = ServerObject()
def entry_frontend():

    app.run(
        host = serv_details.host_frontend,
        port=serv_details.port_frontend
    )