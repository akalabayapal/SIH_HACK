# To combine the two formats in a singular format
# Extract revised dates and costs into a another col
# Remove duplicate uids


import pandas
import numpy as np
import os
import datetime


def get_month_yr(file_path):

    bp = os.path.basename(file_path).split("_")

    yr = int(bp[1])
    month = int(bp[2])

    return datetime.datetime(yr,month)

def process_new(file_path):
    uids = set()
    dept_table = {}
    department = []
    names = []
    state = []
    date_start = []
    date_revised = []
    ids = []
    date_end = []
    date_end_revised = []
    money_expected = []
    money_expected_revised = []
    cspent = []
    progress = []


    df = pandas.read_csv(file_path,sep="|",header=None)

    # drop the sl no its on no use
    def_dropped = df.drop(columns=0).to_numpy()

    

    #process the 1st row to get the format as {id:id,dept:department,"name":name}
    for i,entry in enumerate(def_dropped):


        content = entry[0].split("(")
        uid = content[-1][:-1]
        name = content[0]
        uid2 = content[-3][:-2]
        uid3 = content[2][:-2]
        dept = content[1][:-2]



        try:
            if int(uid) in uids:
                continue
            uids.add(int(uid))
            if dept_table.get(dept):
                dept_table[dept].add(uid)
            else:
                dept_table[dept] = {uid}
        except:
            try:
                if int(uid2) in uids:
                    continue
                uids.add(int(uid2))
                if dept_table.get(dept):
                    dept_table[dept].add(uid2)
                else:
                    dept_table[dept] = {uid2}
            except:
                if int(uid3) in uids:
                    continue
                uids.add(int(uid3))
                if dept_table.get(dept):
                    dept_table[dept].add(uid3)
                else:
                    dept_table[dept] = {uid3}

            # processing the name
            name = content[0]            
    
        names.append(name)
        department.append(dept)
        ids.append(i+1)

        # process dates
        
        date_st = entry[2]
        date_stop = entry[3]
        
        if "(" in date_st:
            sp = date_st.split("(")
            date_start.append(sp[0])
            if sp[1][:-1].strip() == "-":
                date_revised.append(sp[0].strip())
            else:
                date_revised.append(sp[1][:-1].strip())
        else:
            date_start.append(date_st.split(" ")[0].strip())
            date_revised.append(date_st.split(" ")[0].strip())

        if "(" in date_stop:    
            sp = date_stop.split("(")
            date_end.append(sp[0])
            if sp[1][:-1].strip() == "-":
                date_end_revised.append(sp[0].strip())
            else:
                date_end_revised.append(sp[1][:-1].strip())
        else:
            date_end.append(date_stop.split(" ")[0].strip())
            date_end_revised.append(date_stop.split(" ")[0].strip())


        # process the cost 
        cost = entry[4]
        if "(" in cost:
            sp = cost.split("(")
            money_expected.append(float(sp[0]))
            try:
                money_expected_revised.append(float(sp[1][:-1]))
            except:
                money_expected_revised.append(float(sp[0]))

        # add the const spent
        cspent.append(float(entry[5]))

        # lastly add the progress
        progress.append(float(entry[6]))

        
        # add the state
        state.append(entry[1])


    # now convert all to np array
    df = np.array([
        "id",
        "code",
        "department",
        "name",
        "state",
        "date_start",
        "date_start_revised",
        "date_end",
        "date_end_revised",
        "cost_target",
        "cost_target_revised",
        "cost_spent",
        "progress"
    ])
    df2 = np.column_stack((np.array(ids),np.array(list(uids)),np.array(department),np.array(names),np.array(state),np.array(date_start),np.array(date_revised),np.array(date_end),np.array(date_end_revised),np.array(money_expected),np.array(money_expected_revised),np.array(cspent),np.array(progress)))
    np.savetxt(os.path.join('csv','preprocessed',"preprocessed_"+os.path.basename(file_path)),np.vstack((df,df2)),"%s","|")



    # if len(uids) / def_dropped.shape[0] <:
    #     print("Failed to process file. Too many rows failed to parse")


def preprocess(folder):
    for f in  os.scandir(folder):
        print("Processing:",f.path)
        process_new(f.path)
    