# Pipeline for training from preprocessing to csv to database uploading

from ML.pdf2csv import extract_raw
from ML.combine import preprocess
from ML.train import train_model
from ML.feature_extractor import feature_ext
from db_setup import setup_db
from adapter import upload

import sys

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
    



if __name__ == "__main__":

    pdf_folder = sys.argv[1]
    raw_csv_folder = sys.argv[2]
    p_csv_folder = sys.argv[3]
    out_file = sys.argv[4]

    out_cost = sys.argv[5]
    out_time = sys.argv[6]

    pipeline(
        pdf_folder,
        raw_csv_folder=raw_csv_folder,
        p_csv_folder=p_csv_folder,
        out_file=out_file,
        out_cost=out_cost,
        out_time=out_time
    )





