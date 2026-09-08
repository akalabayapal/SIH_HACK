# This provides a ORM interface for connecting to myql

import mysql.connector
import pandas as pd
import tqdm
import config_loader

class ORM:
    def __init__(self):

        self.config = config_loader.SqlObject()

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


        self.db_connection.commit()
        print("[+] Processing Completed")



    def get_all(self):
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

    def get_top_k(self):
        sql_project = 'SELECT * FROM `projects` WHERE progress <= 90 AND `status_cost` = "COMPLETE" AND `status_time` = "COMPLETE" AND `cspend` > 0 ORDER BY overall_risk DESC;'


        # Execute to get the data
        self.cursor.execute(sql_project)

        # Execute the command to get the rows
        rows = self.cursor.fetchall()

        # Return the rows
        return rows


    def get_project(self,code):
        # gets projects total history from the `master` using code
        # gets the risk factors from `projects`

        sql_master = "SELECT * FROM `master` WHERE `code` = " + str(code)
        sql_project = "SELECT * FROM `projects` WHERE `code` = " + str(code)


        # get history
        self.cursor.execute(sql_master)

        history = self.cursor.fetchall()

        # get master
        self.cursor.execute(sql_project)
        data = self.cursor.fetchone()

        if data == None:
            return {"status":'NA',"history":history}

        data['history'] = history

        return data

    

    
def upload(master_csv_path: str,cost_model_path : str,time_model_path :str):

    o = ORM()
    o.add_objects(
        master_csv_path=master_csv_path,
        model_cost_path=cost_model_path,
        model_time_path=time_model_path
    )


    
