# Main API script for backend
import os
import flask
from flask_cors import CORS

from BACKEND import file_uploader
from config_loader import ServerObject, AuthObject
from adapter import ORM, Trainer

orm = ORM()
tr = Trainer()
auth_obj = AuthObject()

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
    page = flask.request.args.get('page', 1)
    limit = flask.request.args.get('limit', 20)
    try:
            p_val = int(page)
            l_val = int(limit)
    except ValueError:
            p_val, l_val = 1, 20
    return flask.jsonify(orm.get_all(p_val,l_val))

@app.route("/get_top_k")
def get_top_k():
    page = flask.request.args.get('page', 1)
    limit = flask.request.args.get('limit', 20)
    try:
        p_val = int(page)
        l_val = int(limit)
    except ValueError:
        p_val, l_val = 1, 20
    return flask.jsonify(orm.get_top_k(p_val, l_val))

@app.route("/get_project/<project_code>")
def get_project(project_code):
    data = orm.get_project(project_code)
    if isinstance(data, dict) and data.get("status") in ["NA", "INVALID_NAME"]:
        return flask.jsonify({"error": "Project not found", "status": "NA"}), 404
    return flask.jsonify(data)

@app.route("/llm_query/<project_code>", methods=["GET", "POST"])
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

    # Return valid JSON so frontend .json() calls succeed
    return flask.jsonify({
        "file_name": filename,
        "filepath": filename,
        "file": filename
    }), 200

@app.route("/get_training_status/<uid>", methods=["GET"])
def get_training_status(uid):
    return flask.jsonify(not tr.get_status(uid))

@app.route("/retrain_model", methods=["POST"])
@app.route("/retrain_model/<path:new_file_path>", methods=["GET", "POST"])
def retrain_model(new_file_path: str = None):
    if flask.request.method == "POST" and flask.request.is_json:
        data = flask.request.get_json() or {}
        new_file_path = data.get("file_path") or data.get("filepath") or data.get("new_file_path") or new_file_path

    if not new_file_path:
        return flask.jsonify({"error": "Missing file_path parameter"}), 400

    target_path = new_file_path
    if not target_path.endswith('.pdf') and not os.path.exists(target_path):
        candidate = os.path.join('BACKEND', 'uploads', target_path + '.pdf')
        if os.path.exists(candidate):
            target_path = candidate

    uid = tr.retrain_model(target_path)
    return flask.jsonify({"uid": uid, "job_id": uid, "status": "started"}), 200

@app.route("/adjust_vote/<code>", methods=["GET"])
def adjust_vote(code):
    op = flask.request.args.get("op")

    if op is None:
        return flask.jsonify({"status": -1, "reason": "Missing 'op' parameter"}), 400

    try:
        code_val = int(code) if str(code).isdigit() else code
        i_op = int(op)
    except ValueError:
        return flask.jsonify({"status": -1, "reason": "Invalid integer format for op"}), 400

    if i_op == 0:
        return flask.jsonify(orm.adjust_vote(code_val, upvote_change=1))
    elif i_op == 1:
        return flask.jsonify(orm.adjust_vote(code_val, upvote_change=-1))
    elif i_op == 2:
        return flask.jsonify(orm.adjust_vote(code_val, downvote_change=1))
    elif i_op == 3:
        return flask.jsonify(orm.adjust_vote(code_val, downvote_change=-1))
    else:
        return flask.jsonify({"status": -1, "reason": "Invalid op code value"}), 400

@app.route("/get_votes/<project_code>", methods=["GET"])
def get_votes(project_code):
    code_val = int(project_code) if str(project_code).isdigit() else project_code
    return flask.jsonify(orm.get_votes(code_val))

@app.post("/auth/login")
def login_auth():
    data = flask.request.get_json() or {}
    uname = data.get('username')
    pwd = data.get('password')

    if uname == auth_obj.admin_uname and pwd == auth_obj.admin_pwd:
        return flask.jsonify({"status": 0, "role": "admin"})
    return flask.jsonify({"status": -1}), 401


@app.route("/search_projects", methods=["GET"])
def search_project():
    query : str = flask.request.args.get('query')
    return flask.jsonify(orm.searched_projects(query))


@app.route("/get_unique",methods=["GET"])
def get_unique_field():

    field = flask.request.args.get("field")
    return flask.jsonify(orm.get_unique(field=field))


@app.route("/filter",methods=["GET"])
def filter():
    field = flask.request.args.get("field")
    val = flask.request.args.get("value")
    return flask.jsonify(orm.filter_content(field=field,value=val))


