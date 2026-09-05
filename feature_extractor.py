import glob
import re
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

# 1. Load and stack all 13 pipe-delimited monthly CSVs
csv_files = sorted(glob.glob('csv/preprocessed/*.csv'))
all_dfs = []

for file in csv_files:
  # Extract YYYY_MM from filename (e.g., preprocessed_output_2025_08.csv -> 2025-08-01)
  match = re.search(r'(\d{4})_(\d{2})', file)
  if match:
    year, month = match.groups()
    report_date = pd.to_datetime(f'{year}-{month}-01')

    df_temp = pd.read_csv(file, sep='|')
    df_temp['report_date'] = report_date
    all_dfs.append(df_temp)

# Concatenate into master panel dataset
panel_df = pd.concat(all_dfs, ignore_index=True)

# Clean date columns & convert to datetime
date_cols = ['date_start', 'date_end', 'date_end_revised']
for col in date_cols:
  panel_df[col] = pd.to_datetime(
      panel_df[col].astype(str).str.strip(), format='%m/%Y', errors='coerce'
  )

# Sort strictly by project code and date
panel_df = panel_df.sort_values(
    by=['code', 'report_date']
).reset_index(drop=True)

# 2. Categorical Encoding
le_dept = LabelEncoder()
panel_df['department_encoded'] = le_dept.fit_transform(
    panel_df['department'].astype(str)
)

le_state = LabelEncoder()
panel_df['state_encoded'] = le_state.fit_transform(
    panel_df['state'].astype(str)
)

# 3. Derive Static & Single-Month Features
panel_df['target_duration_months'] = (
    (panel_df['date_end_revised'] - panel_df['date_start']).dt.days / 30.4375
).clip(lower=1)
panel_df['months_elapsed'] = (
    (panel_df['report_date'] - panel_df['date_start']).dt.days / 30.4375
).clip(lower=0)
panel_df['months_remaining'] = (
    (panel_df['date_end_revised'] - panel_df['report_date']).dt.days / 30.4375
).clip(lower=0.1)

panel_df['cost_escalation_pct'] = (
    (panel_df['cost_target_revised'] - panel_df['cost_target'])
    / panel_df['cost_target'].replace(0, np.nan)
) * 100
panel_df['budget_utilization_pct'] = (
    panel_df['cost_spent'] / panel_df['cost_target_revised'].replace(0, np.nan)
) * 100
panel_df['progress_budget_efficiency'] = panel_df['progress'] / (
    panel_df['budget_utilization_pct'].replace(0, np.nan)
)
panel_df['is_stalled'] = (panel_df['progress'] == 0).astype(int)

# 4. Grouped Momentum Features (Velocity & Acceleration)
grouped = panel_df.groupby('code')

panel_df['velocity_1m'] = grouped['progress'].diff(1).fillna(0).clip(lower=0)
panel_df['velocity_3m'] = (
    grouped['progress']
    .transform(lambda x: x.diff(3) / 3)
    .fillna(panel_df['velocity_1m'])
    .clip(lower=0)
)
panel_df['velocity_6m'] = (
    grouped['progress']
    .transform(lambda x: x.diff(6) / 6)
    .fillna(panel_df['velocity_3m'])
    .clip(lower=0)
)
panel_df['acceleration'] = grouped['velocity_1m'].diff(1).fillna(0)

panel_df['cost_velocity_1m'] = (
    grouped['cost_spent'].diff(1).fillna(0).clip(lower=0)
)
panel_df['cost_velocity_3m'] = (
    grouped['cost_spent']
    .transform(lambda x: x.diff(3) / 3)
    .fillna(panel_df['cost_velocity_1m'])
    .clip(lower=0)
)

# Velocity Gap: Required velocity to finish on time vs current 1m velocity
panel_df['required_velocity'] = (100 - panel_df['progress']) / panel_df[
    'months_remaining'
]
panel_df['velocity_gap'] = (
    panel_df['required_velocity'] - panel_df['velocity_1m']
)

# 5. Shift Targets for T+1 Learning
panel_df['target_progress_next'] = grouped['progress'].shift(-1)
panel_df['target_cost_next'] = grouped['cost_spent'].shift(-1)

# Save full panel with targets for training (dropping rows without T+1 targets)
train_master = panel_df.dropna(
    subset=['target_progress_next']
).reset_index(drop=True)
train_master.to_csv('csv/master.csv',sep="|", index=False)

print(
    f'Successfully saved master.csv with {len(train_master)} training rows!'
)