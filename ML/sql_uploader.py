# This provides a ORM interface for connecting to myql

import mysql.connector
import pandas as pd

class Project:
    def __init__(
            self,
            project_code: int,
            project_name: str,
            status: str, # COMPLETED or TYTP

            project_start_date: str,
            project_start_date_revised:str,
            project_end_date: str,
            project_end_date_revised:str,
            project_budget:float,
            project_budget_revised:float,

            time_risk: int,
            cost_risk: int
    ):
        # just set them
        self.code = project_code
        self.name = project_name
        self.status = status
        self.project_start_date = project_start_date
        self.project_start_date_revised = project_start_date_revised
        self.project_end_date = project_end_date
        self.project_end_date_revised = project_end_date_revised
        self.project_budget = project_budget
        self.project_budget_revised = project_budget_revised
        self.time_risk = time_risk
        self.cost_risk = cost_risk


class ORM:
    def __init__(self):

        # create the connection
        db_connection = mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="hckdb"
    )

    def add_objects(self,master_csv_path: str, model_cost_path: str, model_time_path):
        '''
        1.  This loads all elements from the master.csv
        2.  Searches for them in the model_cost and model_time and generates the final dataframe
        '''

        master = pd.read_csv(master_csv_path,sep='|').to_numpy()

        cost_model = pd.read_csv(model_cost_path,sep='|').to_numpy()
        time_model = pd.read_csv(model_time_path,sep='|').to_numpy()

        # now loop via the cost model (it can be looped through time model also)

        codes = {}

        for data in master:
            code = data[1]

            if code in codes:
                codes[code].append(data)

            else:
                codes[code] = [data]

        obj = {}

        for cost_m in cost_model:
            code = cost_m[1]
            obj[code] = Project(
                
            )




o = ORM()
o.add_objects('csv/master.csv','model_cost.csv','model_time.csv')