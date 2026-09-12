# This file is main api script for backend
import flask
from BACKEND import file_uploader
from flask_cors import CORS
from config_loader import ServerObject
import os

# This gets data from SQL and sends it upstream
from adapter import ORM, Trainer

orm = ORM()
tr = Trainer()

app = flask.Flask(__name__)
CORS(app)

serv_details = ServerObject()

def entry():
    app.run(
        host=serv_details.host_backend,
        port=serv_details.port_backend,
        debug=False
    )

@app.route("/get_all")
def get_all():
    return flask.jsonify(orm.get_all())

@app.route("/get_top_k")
def get_top_k():
    page = flask.request.args.get('page')
    limit = flask.request.args.get('limit')
    return flask.jsonify(orm.get_top_k(int(page), int(limit)))

@app.route("/get_project/<project_code>")
def get_project(project_code):
    return flask.jsonify(orm.get_project(project_code))

@app.route("/llm_query/<project_code>")
def llm_query(project_code):
    print(project_code)
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

    return filename, 200

@app.route("/get_training_status/<uid>", methods=["GET"])
def get_training_status(uid):
    return flask.jsonify(not tr.get_status(uid))

@app.route("/retrain_model/<new_file_path>")
def retrain_model(new_file_path: str):
    return flask.jsonify(tr.retrain_model(os.path.join('BACKEND', 'uploads', new_file_path + '.pdf')))

@app.route("/adjust_vote/<code>", methods=["GET"])
def adjust_vote(code):
    op = flask.request.args.get("op")

    if op is None:
        return flask.jsonify({"status": -1, "reason": "Missing 'op' parameter"}), 400

    try:
        code_int = int(code)
        i_code = int(op)
    except ValueError:
        return flask.jsonify({"status": -1, "reason": "Invalid integer format for code or op"}), 400

    if i_code == 0:
        return flask.jsonify(orm.adjust_vote(code_int, upvote_change=1))
    elif i_code == 1:
        return flask.jsonify(orm.adjust_vote(code_int, upvote_change=-1))
    elif i_code == 2:
        return flask.jsonify(orm.adjust_vote(code_int, downvote_change=1))
    elif i_code == 3:
        return flask.jsonify(orm.adjust_vote(code_int, downvote_change=-1))
    else:
        return flask.jsonify({"status": -1, "reason": "Invalid op code value"}), 400

@app.route("/get_votes/<project_code>", methods=["GET"])
def get_votes(project_code):
    try:
        code_int = int(project_code)
    except ValueError:
        return flask.jsonify({"status": -1, "reason": "Invalid project code format"}), 400
    return flask.jsonify(orm.get_votes(code_int))