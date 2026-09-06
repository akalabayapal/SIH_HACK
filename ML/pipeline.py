# Pipeline for training from preprocessing to csv to database uploading

from pdf2csv import extract_raw
from combine import preprocess
from train import train_model
from feature_extractor import feature_ext

import sys

pdf_folder = sys.argv[1]
raw_csv_folder = sys.argv[2]
p_csv_folder = sys.argv[3]
out_file = sys.argv[4]

out_cost = sys.argv[5]
out_time = sys.argv[6]

def pipeline(pdf_folder: str,raw_csv_folder: str,p_csv_folder: str,out_file: str):
    # print("[+] Preprocessing the pdfs to extract csv...")
    # extract_raw(pdf_folder,raw_csv_folder)

    # print("[+] Preprocessing csv and cleaning it up...")
    # preprocess(raw_csv_folder,p_csv_folder)

    # print("[+] Running feature extraction...")
    # feature_ext(p_csv_folder,out_file)

    print("[+] Train the full model and dump the csv file")
    train_model(out_file,out_cost=out_cost,out_time=out_time)


pipeline(
    pdf_folder=pdf_folder,
    raw_csv_folder=raw_csv_folder,
    p_csv_folder=p_csv_folder,
    out_file=out_file
)



