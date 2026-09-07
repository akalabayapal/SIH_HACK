# This provides a ORM interface for connecting to myql

import mysql.connector
import pandas as pd
import tqdm
import time

class Project:
    def __init__(
            self,
            project_code: int,
            project_name: str,
            status_cost: str, # COMPLETED or TYTP
            status_time: str,

            project_start_date: str,
            project_start_date_revised:str,
            project_end_date: str,
            project_end_date_revised:str,
            project_budget:float,
            project_budget_revised:float,

            cspend: float,

            time_risk: int,
            cost_risk: int,
            progress: float,
    ):
        # just set them
        self.code = project_code
        self.name = project_name
        self.status_cost = status_cost
        self.status_time = status_time
        self.project_start_date = project_start_date
        self.project_start_date_revised = project_start_date_revised
        self.project_end_date = project_end_date
        self.project_end_date_revised = project_end_date_revised
        self.project_budget = project_budget
        self.project_budget_revised = project_budget_revised
        self.cspend = cspend
        self.time_risk = time_risk
        self.cost_risk = cost_risk
        self.progress = progress


class ORM:
    def __init__(self):

        # create the connection
        self.db_connection = mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="hckdb"
    )
        if self.db_connection.is_connected():
            self.cursor = self.db_connection.cursor()
            print("[+] Connection to DB is completed.")
        else:
            raise RuntimeError('Failed to connect to mysql check if the server is up and running.\n'\
                               'Follow the guidelines or call me to properly set the databse up')

    def add_objects(self,master_csv_path: str, model_cost_path: str, model_time_path):
        '''
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
        for data in tqdm.tqdm(cost_model):

            code = data[1]

            if code in codes:
                continue

            codes[code] = True

            # filter master by that code and also time model
            time_filtered = time_model[time_model[:,1] == code]
            master_all = master[master[:,1] == code]
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
                dept+"__"+name,
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
            except Exception as ex:
                print(ex)
    
        self.db_connection.commit()
        print("[+] Processing Completed")

            
            



            
            
          




o = ORM()
o.add_objects('ML/csv/master.csv','ML/csv/final/model_cost.csv','ML/csv/final/model_time.csv')