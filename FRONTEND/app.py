# This file is main api script for backend
import flask
from config_loader import ServerObject
from pathlib import Path
import os



app = flask.Flask(__name__)

# Define the absolute path to your frontend folder
FRONTEND_FOLDER = os.path.join(app.root_path, 'static')

# 1. Route for the root URL (homepage)
@app.route('/')
def home():
    return flask.send_file(os.path.join(FRONTEND_FOLDER,'index.html'))

# 2. Catch-all route for ALL other HTML, CSS, JS, and image files
@app.route('/<path:path>')
def auto_route_static(path):
    
    # Security check: Prevent directory traversal attacks
    file_path = os.path.join(FRONTEND_FOLDER, path)

    if os.path.isfile(file_path):
        return flask.send_file(file_path)
    else:
        flask.abort(404) # Return a 404 error if the file doesn't exist



'''
This is the flask config for @Shubham_Das. Please do not change this file
For running whole project execute 

`python run.py` in the root folder
'''


serv_details = ServerObject()
def entry_frontend():

    app.run(
        host = serv_details.host_frontend,
        port=serv_details.port_frontend,
        debug=False
    )