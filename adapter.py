# This provides a ORM interface for connecting to myql

import mysql.connector
import pandas as pd
import tqdm
import config_loader
import shutil
import os
import uuid
import queue
import threading
import time
import multiprocessing
import json
import pickle

from google import genai


from ML.pdf2csv import extract_raw
from ML.combine import preprocess
from ML.train import train_model
from ML.feature_extractor import feature_ext
from db_setup import setup_db


def pipeline(pdf_folder: str,raw_csv_folder: str,p_csv_folder: str,out_file: str,out_cost:str,out_time:str,debug :bool=False):

    if debug:
        print("[+] Preprocessing the pdfs to extract csv...")
    extract_raw(pdf_folder,raw_csv_folder)

    if debug:
        print("[+] Preprocessing csv and cleaning it up...")
    preprocess(raw_csv_folder,p_csv_folder)

    if debug:
        print("[+] Running feature extraction...")
    feature_ext(p_csv_folder,out_file)

    if debug:
        print("[+] Train the full model and dump the csv file")
    train_model(out_file,out_cost=out_cost,out_time=out_time)

    # Now upload it to the db
    print("[+] Setting up database and making tables...")
    setup_db()

    print('[+] Uploading data to database...')
    upload(out_file,out_cost,out_time)



class ORM:
    def __init__(self):

        self.config = config_loader.SqlObject()

        if self.config.gem_key == "YOUR_GEMINI_API_KEY":
            print("WARNING:Your gemini client has not been configured using dev mode dummy simulation for .llm_query()")
            self.client = None
        else:
            self.client = genai.Client(api_key=self.config.gem_key)
        if os.path.exists('.stats'):
            self.stats = pickle.load(
                open('.stats','rb')
            )
        else:
            self.stats = None

        # create the connection
        self.db_connection = mysql.connector.connect(
            host=self.config.host,
            user=self.config.user,
            password=self.config.password,
            database=self.config.database
    )
        if self.db_connection.is_connected():
            self.cursor = self.db_connection.cursor(dictionary=True)
            print("[+] Connection to DB is completed.")
        else:
            raise RuntimeError('Failed to connect to mysql check if the server is up and running.\n'\
                               'Follow the guidelines or call me to properly set the databse up')

    def add_objects(self,master_csv_path: str, model_cost_path: str, model_time_path):
        '''
        Adds the data from .csv to the database
        (Not to be called explicitly from backend wpi warning @Aditya_patel)

        1.  This loads all elements from the master.csv
        2.  Searches for them in the model_cost and model_time and generates the final dataframe
        '''

        master = pd.read_csv(master_csv_path,sep='|').to_numpy()

        cost_model = pd.read_csv(model_cost_path,sep='|').to_numpy()
        time_model = pd.read_csv(model_time_path,sep='|').to_numpy()

        codes = {}

        # now loop via the cost model (it can be looped through time model also)

        sql = """
                    INSERT INTO projects (
                        code,
                        name,
                        status_cost,
                        status_time,
                        start_date,
                        start_date_revised,
                        end_date,
                        end_date_revised,
                        project_budget,
                        project_budget_revised,
                        cspend,
                        time_risk,
                        cost_risk,
                        overall_risk,
                        progress
                        )
                        VALUES (%s, %s , %s , %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """
        print("[+] Processing data for 'projects' table")

        # stats
        total = 0
        tytp = 0
        tbtp = 0
        
        for data in tqdm.tqdm(cost_model):

            code = data[1]
            department,n = data[2].split("___",1)

            if code in codes:
                continue

            codes[code] = True

            # filter master by that code and also time model
            time_filtered = time_model[time_model[:,1] == code]
         
            master_all = master[(master[:,2] == department) & (master[:,3] == n)]
            
            if len(master_all) == 0:
                continue
            master_filtered = master_all[0]

            status_time = time_filtered[0][3]
            status_cost = data[3]

            name = master_filtered[3]
            dept = master_filtered[2]
            start_date = master_filtered[5]
            start_date_revised = master_filtered[6]
            end_date = master_filtered[7]
            end_date_revised = master_filtered[8]
            cost_target = master_filtered[9]
            cost_target_revised = master_filtered[10]
            cspend = master_filtered[11]
            progress = max(master_all[:,-2])

   

            cost_risk = data[6]
            time_risk = time_filtered[0][10]

            if status_cost == 'TYTP' or status_cost == 'TBTP': 
                cost_risk = 0

    

            if status_time == 'TYTP' or status_time == 'TBTP':
                time_risk = 0

            if pd.isna(start_date):
                start_date = start_date_revised

            if pd.isna(start_date_revised):
                start_date_revised = start_date


            if pd.isna(end_date):
                end_date = end_date_revised

            if pd.isna(end_date_revised):
                    end_date_revised = end_date

            if pd.isna(cost_target):
                cost_target = cost_target_revised

            if pd.isna(cost_target_revised):
                    cost_target_revised = cost_target

            if pd.isna(time_risk):
                time_risk = 0

            if pd.isna(cost_risk):
                cost_risk = 0
                
            cd = tuple(None if pd.isna(x)  else x for x in (
                code,
                dept+"___"+name,
                status_cost,
                status_time,
                start_date,
                start_date_revised,
                end_date,
                end_date_revised,
                cost_target,
                cost_target_revised,
                cspend,
                time_risk,
                cost_risk,
                max(time_risk,cost_risk),
                progress
            ))

            try:
                self.cursor.execute(sql,cd)
                total += 1
                if status_cost == 'TYTP' and status_time == 'TYTP':
                    tytp += 1
                if status_cost == 'TBTP' and status_time == 'TBTP':
                    tbtp += 1
            except Exception as ex:
                print(ex)
    
        self.db_connection.commit()

        data_content = {
            "total":total,
            "tytp":tytp,
            "tbtp":tbtp
        }

        pickle.dump(
            data_content,
            open(".stats",'wb')
        )
        print("[+] Processing Completed")


        # Now process data for 'master'

        sql_master = """
                    INSERT INTO master (
                        code,
                        name,
                        department,
                        state,
                        date_start,
                        date_start_revised,
                        date_end,
                        date_end_revised,
                        cost_target,
                        cost_target_revised,
                        cost_spent,
                        progress,
                        report_date
                        )
                        VALUES ( %s , %s , %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """

        print("Processing data for 'master':")
        for data in tqdm.tqdm(master):

            code = data[1]
            name = data[3]
            dept = data[2]

            state = data[4]

            start_date = data[5]
            start_date_revised = data[6]

            end_date = data[7]
            end_date_revised = data[8]

            cost_target = data[9]
            cost_target_revised = data[10]

            cspend = data[11]

            progress = data[12]
            report_date = data[13]


            c_data = tuple(None if pd.isna(x) else x for x in(
                code,
                name,
                dept,
                state,
                start_date,
                start_date_revised,
                end_date,
                end_date_revised,
                cost_target,
                cost_target_revised,
                cspend,
                progress,
                report_date
            ))

            self.cursor.execute(sql_master,c_data)

            # Processing data for the customer_review

        print("[+] Processing for `review`...")
        query_customer = "INSERT INTO review (code) VALUES (%s);"
        for data in tqdm.tqdm(cost_model):
            code = data[1] # get the codes
            self.cursor.execute(query_customer,(code,))
        self.db_connection.commit()
        print("[+] Processing completed for the `review`...")


        self.db_connection.commit()
        print("[+] Processing Completed")



    def get_all(self) -> list[dict]:
        '''
        Gets all rows and send them all to UI
        '''
        sql = "SELECT * FROM `projects`"

        # Execute to get all data
        self.cursor.execute(sql)

        # fetch all rows
        rows = self.cursor.fetchall()

        # return all the rows
        return rows

    def get_top_k(self) -> list[dict]:
        '''
        Gets the top k filtered project results
        '''
        sql_project = 'SELECT * FROM `projects` WHERE progress <= 90 AND (`status_cost` = "COMPLETE" OR `status_time` = "COMPLETE") AND `cspend` > 0 ORDER BY overall_risk DESC;'


        # Execute to get the data
        self.cursor.execute(sql_project)

        # Execute the command to get the rows
        rows = self.cursor.fetchall()

        # Return the rows
        return rows


    def get_project(self, code) -> dict:
        '''
        Returns a single project data along with its historical trend
        '''

        # Get current project from projects
        sql_project = "SELECT * FROM `projects` WHERE `code` = %s"

        self.cursor.execute(sql_project, (code,))
        data = self.cursor.fetchone()

        if data is None:
            return {"status": "NA", "history": []}

        # Match history using name + department
        # projects stores department merged into name as:
        # department__name

        full_name = data["name"]

        try:
            department, name = full_name.split("___", 1)
        except ValueError:
            return {
                "status": "INVALID_NAME",
                "history": []
            }

        sql_master = """
            SELECT *
            FROM `master`
            WHERE `name` = %s
              AND `department` = %s
        """

        self.cursor.execute(sql_master, (name, department))
        history = self.cursor.fetchall()

        data["history"] = history

        return data

    def llm_query(self,json_data) -> dict:
        '''
        Query llm and gets comprehenisve explaination of the project
        '''

        if self.client == None:

            # Return dummy data
            return {
                "status":0,
                "content":
                {"risk_summary":"A concise explanation of the project's overall risk",
                "evidence_behind_the_risk":"Specific observations from the current and historical data that explain the risk.",
                "cost_risk":"Explain the financial pattern and why it may have produced the supplied cost-risk value.",
                "time_risk":"Explain the schedule and physical-progress pattern and why it may have produced the supplied time-risk value.",
                "possible_on_ground_explanations":"List 2–4 plausible explanations, clearly marked as hypotheses rather than confirmed facts."
                }
            }
        

        prompt = """

You are an expert government infrastructure project monitoring analyst.

Your task is to analyze the supplied project data and explain the reasoning behind the model's calculated risk.

The numerical risk values are produced by a separate machine-learning system. DO NOT recalculate, replace, or override the model's risk. Instead, interpret the available evidence and explain what may be happening with the project.

Analyze the following:

1. **Current project position**

   * Compare the project's current physical progress with its expenditure.
   * Compare actual expenditure with the original/revised project budget.
   * Compare the original and revised completion dates.
   * Identify unusually large gaps between financial progress, physical progress, and planned timelines.

2. Status Types (for both cost and time)
* COMPLETED:The project has been simulated by ML model properly and ready for evaluation by LLM
* TYTP (Too young to predict):The project do not have proper enough data to be simulated. Use historical facts from internet if possible.Do not make up facts.
* TBTP (Too bad to predict):This projects went out of simulation frame. Please notice the progress and give proper results. It's better that you use your reasoning than using risk scores in this case.


3. **Historical trajectory**

   * Examine how expenditure and physical progress have changed over time.
   * Identify signs of slow progress, stagnation, acceleration, or abnormal spending.
   * Identify whether the project appears to have repeatedly missed or revised its targets.
   * Distinguish between persistent problems and recent changes.

3. **Reasoning behind the model's risk**

   * Explain why the supplied cost risk, time risk, and overall risk are high or low.
   * Connect the numerical risk factors to concrete evidence in the supplied data.
   * If cost risk dominates overall risk, explain what financial pattern supports that.
   * If time risk dominates, explain what schedule/progress pattern supports that.

4. **Possible on-ground realities**
   Based ONLY on the supplied evidence, identify plausible real-world situations that could explain the observed pattern, such as:

   * construction delays
   * procurement or contracting delays
   * land/site issues
   * approval or regulatory delays
   * slow physical execution despite expenditure
   * cost escalation
   * repeated schedule revisions
   * stalled or near-stalled work
   * front-loaded expenditure
   * mismatch between spending and physical progress

   These are hypotheses, NOT confirmed facts. Clearly distinguish evidence from possible explanations.

5. **Critical warning**
   Point out the most important issue that a project-monitoring authority should investigate based on the available data.

IMPORTANT RULES:

* Use ONLY the supplied project data.
* Do not search the internet.
* Do not invent events, causes, contractors, political issues, geological conditions, funding problems, or other facts.
* Never present a possible explanation as a confirmed fact.
* If the data is insufficient to determine the cause, explicitly say so.
* Do not blindly trust the risk score; explain the evidence supporting it.
* Do not make recommendations that require information not present in the data.
* Focus on useful, evidence-based reasoning rather than generic statements.

Return the analysis in this structure:
{"risk_summary":"A concise explanation of the project's overall risk",
"evidence_behind_the_risk":"Specific observations from the current and historical data that explain the risk.",
"cost_risk":"Explain the financial pattern and why it may have produced the supplied cost-risk value.",
"time_risk":"Explain the schedule and physical-progress pattern and why it may have produced the supplied time-risk value.",
"possible_on_ground_explanations":"List 2–4 plausible explanations, clearly marked as hypotheses rather than confirmed facts."
}

### Key Warning

Return ONLY a valid JSON object.
Do not use Markdown.
Do not use ```json.
Do not add explanations before or after the JSON.

The single most important issue that should be investigated.


DATA:""" +json.dumps(json_data, indent=2, default=str)


        try:
            response = self.client.models.generate_content(
                        model='gemini-2.5-flash',  # The fastest, free-tier friendly model
                        contents=prompt,
                        config=genai.types.GenerateContentConfig(
        response_mime_type="application/json",
    )
            )

            return {"status":0,"content":json.loads(response.text)}
        except Exception as ex:
            return {"status":-1,"reason":"Error failed due to:"+str(ex)}

    def get_stats(self) -> dict:
        '''
        Returns the status of the projects currently
        '''

        if self.stats == None:
            return {
                "status":-1,
                "reason":"Please upload data to database to get stats @Admin"
            }

        return {"status":0,"stats":self.stats}

        

    def adjust_vote(self, code: int, upvote_change: int | None = None, downvote_change: int | None = None):
        """
        Adjusts upvotes and/or downvotes by +1 or -1 for a specific code.
        Pass None for the vote type you do not want to change.
        """

        cursor = self.cursor
        conn = self.db_connection
        # 1. Input Validation: Enforce only +1, -1, or None
        valid_changes = {1, -1, None}
        if upvote_change not in valid_changes or downvote_change not in valid_changes:
            print("❌ Error: Vote changes must be +1, -1, or None.")
            return

        # 2. Build the query dynamically based on which parameter is provided
        set_clauses = []
        params = []

        if upvote_change is not None:
            # Prevent votes from dropping below zero using GREATEST()
            set_clauses.append("upvotes = GREATEST(0, upvotes + %s)")
            params.append(upvote_change)

        if downvote_change is not None:
            set_clauses.append("downvotes = GREATEST(0, downvotes + %s)")
            params.append(downvote_change)

        # Nothing to update if both are None
        if not set_clauses:
            print("ℹ️ No vote changes provided.")
            return

        params.append(code)
        query = f"UPDATE review SET {', '.join(set_clauses)} WHERE code = %s;"

        # 3. Execute update using the passed cursor and connection
        try:
            cursor.execute(query, tuple(params))
            conn.commit()

            if cursor.rowcount > 0:
               return {"status":0}
            else:
                return {"status":-1,"reason":"Code is not found"}

        except Exception as e:
            return {"status":-1,"reason":"Sorry! Internal Server error"}


    def get_votes(self,code: int) -> dict | None:

        """Retrieves the upvotes and downvotes for a specific project code.

        Returns a dictionary {'upvotes': X, 'downvotes': Y} or None if the code isn't
        found.
        """
        query = "SELECT upvotes, downvotes FROM review WHERE code = %s;"

        cursor = self.cursor

        try:
            cursor.execute(query, (code,))
            result = cursor.fetchone()

            if result:
                upvotes, downvotes = result
                return {"status":0,"upvotes": result[upvotes], "downvotes":result[downvotes]}
            else:
                return {"status":-1,"reason":"Code not found"}
        

        except Exception as e:
            return {"status":-1,"reason":"Sorry! Internal Server Error"}
    



class Trainer:
    def __init__(self):
        self.file_to_train = queue.Queue(2048)
        self.procs = {}

        #0. Load the config file to get the dirs
        self.mobj = config_loader.ModelObject()

        # start the thread to schedule the threads...
        th = threading.Thread(target=self.train_scheduler)
        th.daemon = True
        th.start()


        

    def retrain_model(self,new_file_path:str):
        '''
        To train the model using new data present
        '''

        
        # 1. put it in queue
        uid = uuid.uuid4()
        self.file_to_train.put({
            "uid":uid,
            "file_path":new_file_path
        })

        return uid # return the job id

    def check_procs(self):
        for p in self.procs:
            if not self.procs[p].is_alive():
                del self.procs[p]


    def train_scheduler(self):
        while True:

            try:
                item = self.file_to_train.get(block=False,timeout=0)
            except queue.ShutDown:

                for p in self.procs:
                    try:
                        self.procs[p].kill()
                    except:
                        pass

                break # Use this as a poison pill
            except:
                self.check_procs()
                continue

            file_path = item['file_path']
            uid = item['uid']

            #1. Copy the file
            shutil.copyfile(file_path,os.path.join(self.mobj.raw_pdf,os.path.basename(file_path)))

            #2. Start the training process
            p = multiprocessing.Process(target=pipeline,args=(
                self.mobj.raw_pdf,
                self.mobj.raw_csv,
                self.mobj.p_csv,
                self.mobj.master_csv,
                self.mobj.cost_data,
                self.mobj.time_data
                ))

            self.procs[uid] = p

            p.start()
            self.check_procs()

            time.sleep(0.3)


    def get_status(self,uid):
        p: multiprocessing.Process = self.procs[uid]

        if p.is_alive():
            return True
        else:
            return False




    
def upload(master_csv_path: str,cost_model_path : str,time_model_path :str):

    o = ORM()
    o.add_objects(
        master_csv_path=master_csv_path,
        model_cost_path=cost_model_path,
        model_time_path=time_model_path
    )
