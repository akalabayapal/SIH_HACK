# Preprocessing script for extracting the pdf to raw csv
import datetime
import pdfplumber
import pandas as pd
import numpy as np
import os
import tqdm


month_map = {
    "January":1,
    "February":2,
    "March":3,
    "April":4,
    "May":5,
    "June":6,
    "July":7,
    "August":8,
    "September":9,
    "October":10,
    "November":11,
    "December":12
}

table_settings = {
    "vertical_strategy": "lines",  # Uses visible grid lines for columns
    "horizontal_strategy": "lines",  # Uses visible grid lines for rows
    "snap_tolerance": 3,  # Snaps slightly misaligned lines together
    "join_tolerance": 3,
    "edge_min_length": 10,
}


def extract_month_year(file_path:str):
    # get the basename
    base_name_parts = os.path.basename(file_path).split(".")[0].split("_")

    month = base_name_parts[1]
    year = base_name_parts[2] 

    return datetime.datetime(int(year),month_map[month],1)

def get_all_tables(file_path:str):


    data_frames = []

    with pdfplumber.open(file_path) as pdf:
        # Loop through each page of the document
        for page_num, page in enumerate(tqdm.tqdm(pdf.pages)):

            
         
            # Extract all tables found on the current page
            tables = page.extract_tables(table_settings=table_settings)
            for table in tables:
                    
                    df2 = pd.DataFrame(table[1:], columns=table[0])
                    if df2.shape[1] == 8:
                        df2_clean = df2.replace(r'^\s*$', pd.NA, regex=True)
                        data_frames.append((page_num+1,df2_clean.dropna().to_numpy()))
                  
                    # if df2.shape[1] == 9:
                    #     df2_clean = df2.replace(r'^\s*$', pd.NA, regex=True)
                    #     data_frames.append((page_num+1,df2_clean.iloc[:,2:].dropna().to_numpy()))

    print("Stacking the data to stack_frame for file:",os.path.basename(file_path))

    errs = []
    if len(data_frames) == 0:
        print("Failed to extract data from file")
        return
 
    stack = data_frames[0][1]    
    for id,frame in data_frames[1:]:
        if frame.shape[-1] != 8:
        # if frame.shape[-1] != 7:
            errs.append("Faulty data_frame excluded and needs manunal inspection:page_num:"+str(id))
            continue
        
        stack = np.vstack((stack,frame))
    

    flt = stack.flatten()
    shape_now = stack.shape

    for i,ele in enumerate(flt):
        flt[i] = flt[i].replace('\n',' ').lower()

    np.savetxt(os.path.join('csv','raw','output_'+extract_month_year(file_path).strftime("%Y_%m")+'.csv'),flt.reshape(shape_now),"%s","|")

    if len(errs) > 0:
        print("========ERRORS=========")
        print("".join([x+"\n" for x in errs]))
        print("=======================")


def extract_raw(folder):
    for file in os.scandir(folder):

        name = extract_month_year(file)
        print("Processing file:",os.path.basename(file))
        get_all_tables(file.path)

