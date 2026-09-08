# This is the base script for the project.
# Be it frontend or backend start the project using python run.py

import json
import pipeline
import multiprocessing
from BACKEND.app import entry
from FRONTEND.app import entry_frontend

def main():

    PDF_FOLDER = 'ML/raw'
    RAW_CSV_FOLDER = 'ML/csv/raw'
    P_CSV_FOLDER = 'ML/csv/preprocessed'
    OUT_FILE = 'ML/csv/master.csv'
    B_COST = 'ML/csv/final/model_cost.csv'
    T_COST = 'ML/csv/final/model_time.csv'

    req_keys_config = [
        "host",
        "user",
        "password",
        "database",
        "host_backend",
        "port_backend",
        "host_frontend",
        "port_frontend",
        "is_trained"
    ]

    obj = None

    # 1. Check if all the required schema is followed in the config.json
    with open('config.json','r') as fs:
        obj = json.load(fs)
        if not list(obj.keys()) == req_keys_config:
            print("Error: The required schema do not match to start the program. Contact team admin")
            return

    # 2. Check if training is complete
    if obj['is_trained'] == False:
        # use pipeline.py to train it
        pipeline.pipeline(
                    PDF_FOLDER,
                    raw_csv_folder=RAW_CSV_FOLDER,
                    p_csv_folder=P_CSV_FOLDER,
                    out_file=OUT_FILE,
                    out_cost=B_COST,
                    out_time=T_COST
        )

        # Make it train as true
        obj['is_trained'] = True

    # 3. Start the backend and frontend in two processes
    # As frontend do not need much debuging putting it in another thread

    proc = multiprocessing.Process(entry_frontend)
    proc.start()

    # Start the backend proc
    entry()

    # Kill the frontend server
    proc.kill()



if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()