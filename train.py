import os
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
import tqdm
import pickle

# 1. Load dataset & prepare clean project keys
data = pd.read_csv(os.path.join('csv', 'master.csv'), sep='|')
data['project_key'] = (
    data['department'].astype(str) + '___' + data['name'].astype(str)
)

# 2. Derive targets for training delta models
df_clean = data.sort_values(['project_key', 'report_date']).drop_duplicates(
    subset=['project_key', 'report_date']
)
df_clean['target_cost_next'] = df_clean.groupby('project_key')[
    'cost_spent'
].shift(-1)
df_clean['target_progress_next'] = df_clean.groupby('project_key')[
    'progress'
].shift(-1)

df_train = df_clean.dropna(
    subset=['target_cost_next', 'target_progress_next']
).copy()
df_train['cost_delta'] = df_train['target_cost_next'] - df_train['cost_spent']
df_train['progress_delta'] = (
    df_train['target_progress_next'] - df_train['progress']
)

feature_cols = [
    'department_encoded',
    'state_encoded',
    'months_elapsed',
    'months_remaining',
    'cost_escalation_pct',
    'budget_utilization_pct',
    'progress_budget_efficiency',
    'is_stalled',
    'velocity_1m',
    'velocity_3m',
    'velocity_6m',
    'acceleration',
    'cost_velocity_1m',
    'cost_velocity_3m',
    'required_velocity',
    'velocity_gap',
    'cost_spent',
]

# 3. Train Cost and Progress Delta models
model_cost = HistGradientBoostingRegressor(
    max_iter=150, learning_rate=0.05, max_depth=6, random_state=42
)
model_cost.fit(df_train[feature_cols], df_train['cost_delta'])

model_prog = HistGradientBoostingRegressor(
    max_iter=150, learning_rate=0.05, max_depth=6, random_state=42
)
model_prog.fit(df_train[feature_cols], df_train['progress_delta'])

# 4. Get the most recent report per project
latest_reports = (
    data.sort_values(['project_key', 'report_date'])
    .groupby('project_key')
    .last()
    .reset_index()
)

# 5. Simulation Loop (2-Year Horizon = 24 Months)
results = []
MAX_SIMULATION_MONTHS = 24

for idx, row in tqdm.tqdm(latest_reports.iterrows(), total=latest_reports.shape[0]):
  project_code = row['code']
  project_key = row['project_key']

  # Baseline target cost (prefer revised target if present)
  target_cost = (
      row['cost_target_revised']
      if pd.notnull(row['cost_target_revised']) and row['cost_target_revised'] > 0
      else row['cost_target']
  )

  # Check initial TYTP criteria (>24 months remaining or <3 months elapsed)
  if row['months_remaining'] > 24 or row['months_elapsed'] < 3:
    results.append({
        'project_code': project_code,
        'project_key': project_key,
        'status': 'TYTP',
        'e_cost': np.nan,
        'target_cost': target_cost,
        'risk_pct': np.nan,
        'simulated_months': 0,
    })
    continue

  # Initialize simulation state
  curr_state = row[feature_cols].copy()
  curr_cost = row['cost_spent']
  curr_progress = row['progress']
  months_simulated = 0

  while curr_progress < 100.0 and months_simulated < MAX_SIMULATION_MONTHS:
    X_input = pd.DataFrame([curr_state[feature_cols]])

    # Predict monthly increments with non-negative bounds
    pred_cost_inc = max(0.0, model_cost.predict(X_input)[0])
    pred_prog_inc = max(0.1, model_prog.predict(X_input)[0])

    curr_cost += pred_cost_inc
    curr_progress = min(100.0, curr_progress + pred_prog_inc)
    months_simulated += 1

    # Update state features for next iteration
    curr_state['cost_spent'] = curr_cost
    curr_state['months_elapsed'] = (
        0 if pd.isna(curr_state['months_elapsed']) else curr_state['months_elapsed']
    ) + 1
    curr_state['months_remaining'] = max(0, curr_state['months_remaining'] - 1)

  # Evaluate outcome after 2-year simulation window
  if curr_progress < 100.0:
    # Target completion is too far away (>24 months required)
    results.append({
        'project_code': project_code,
        'project_key': project_key,
        'status': 'TYTP',
        'e_cost': np.nan,
        'target_cost': target_cost,
        'risk_pct': np.nan,
        'simulated_months': months_simulated,
    })
  else:
    e_cost = curr_cost
    risk_pct = (
        ((e_cost - target_cost) / target_cost) * 100
        if target_cost > 0
        else np.nan
    )

    results.append({
        'project_code': project_code,
        'project_key': project_key,
        'status': 'COMPLETED',
        'e_cost': round(e_cost, 2),
        'target_cost': target_cost,
        'risk_pct': round(risk_pct, 2) if pd.notnull(risk_pct) else np.nan,
        'simulated_months': months_simulated,
    })

# 6. Convert results to DataFrame
df_results = pd.DataFrame(results)

pickle.dump(df_results,open("results_cost.pkl",'wb'))

# Display summary statistics
print(df_results['status'].value_counts())
print('\nSample Results:')
print(df_results.head(10))