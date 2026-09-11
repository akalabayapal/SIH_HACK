# This file is main api script for backend
import flask
from BACKEND import file_uploader
from flask_cors import CORS
from config_loader import ServerObject

# This gets data from SQL and sends it upstream
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
CORS(app)


'''
Hi @Aditya write your backend code here.
Link the entry of the code inside the function.

Centralized run.py will run the server for you by calling this function
'''


serv_details = ServerObject()

def entry():

    app.run(
        host = serv_details.host_backend,
        port=serv_details.port_backend,
        debug=False
    )

@app.route("/get_all")
def get_all():
    return flask.jsonify(orm.get_all())

@app.route("/get_top_k")
def get_top_k():
    return flask.jsonify(orm.get_top_k())

@app.route("/get_project/<project_code>")
def get_project(project_code):
    return flask.jsonify(orm.get_project(project_code))

@app.route("/llm_query/<project_code>")
def llm_query(project_code):
    data = orm.get_project(project_code)
    return flask.jsonify(orm.llm_query(data))

@app.route("/get_stats")
def get_stats():
    return flask.jsonify(orm.get_stats())

@app.route("/upload_file", methods=["POST"])
def upload_file():
    if "file" not in flask.request.files:
        return flask.jsonify({"error": "No file part in request"}), 400

    file = flask.request.files["file"]

    if file.filename == "":
        return flask.jsonify({"error": "No file selected for uploading"}), 400

    month = flask.request.form.get("month")
    year = flask.request.form.get("year")

    if not month or not year:
        return flask.jsonify({"error": "Month and year are required"}), 400

    try:
        filename = file_uploader.upload(file, month, year)
    except ValueError as e:
        return flask.jsonify({"error": str(e)}), 400

    return flask.jsonify({"message": "File uploaded", "filename": filename}), 201