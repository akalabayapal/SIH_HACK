import os
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
import tqdm

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

def train_cost(file:str,result_cost: str):
    # 1. Load dataset & prepare clean project keys
    data = pd.read_csv(file, sep='|')
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
            'status': 'TBTP',
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

        # Save the result to csv file

        df_results.to_csv(result_cost,sep='|')

        # Display summary statistics



# ========================== TRAINING COST MODEL ======================= #


def train_time(file: str,results_time: str):
    # 1. Load dataset & prepare clean project keys
    data = pd.read_csv(file, sep='|')
    data['project_key'] = (
        data['department'].astype(str) + '___' + data['name'].astype(str)
    )

    # 2. Derive targets for training incremental models
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

    # 5. Combined Simulation Loop (2-Year Horizon = 24 Months)
    results = []
    MAX_SIMULATION_MONTHS = 24

    for idx, row in tqdm.tqdm(latest_reports.iterrows(), total=latest_reports.shape[0]):
      project_code = row['code']
      project_key = row['project_key']

      # Baseline financial target
      target_cost = (
          row['cost_target_revised']
          if pd.notnull(row['cost_target_revised']) and row['cost_target_revised'] > 0
          else row['cost_target']
      )

      # Baseline schedule target
      months_elapsed_init = (
          0 if pd.isna(row['months_elapsed']) else row['months_elapsed']
      )
      months_remaining_init = (
          0 if pd.isna(row['months_remaining']) else row['months_remaining']
      )
      target_duration = (
          row['target_duration_months']
          if pd.notnull(row['target_duration_months'])
          and row['target_duration_months'] > 0
          else (months_elapsed_init + months_remaining_init)
      )

      # Check initial TYTP gate (<3 months elapsed or >24 months remaining)
      if months_remaining_init > 24 or months_elapsed_init < 3:
        results.append({
            'project_code': project_code,
            'project_key': project_key,
            'status': 'TYTP',
            'e_cost': np.nan,
            'target_cost': target_cost,
            'cost_risk_pct': np.nan,
            'e_duration': np.nan,
            'target_duration': round(target_duration, 1),
            'time_overrun_months': np.nan,
            'time_risk_pct': np.nan,
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

        # Predict monthly increments
        pred_cost_inc = max(0.0, model_cost.predict(X_input)[0])
        pred_prog_inc = max(0.1, model_prog.predict(X_input)[0])

        curr_cost += pred_cost_inc
        curr_progress = min(100.0, curr_progress + pred_prog_inc)
        months_simulated += 1

        # Update dynamic features for subsequent iterations
        curr_state['cost_spent'] = curr_cost
        curr_state['months_elapsed'] += 1
        curr_state['months_remaining'] = max(0, curr_state['months_remaining'] - 1)

      # Process simulation outcomes
      if curr_progress < 100.0:
        # Requires >24 months simulation window -> Tag TYTP
        results.append({
            'project_code': project_code,
            'project_key': project_key,
            'status': 'TBTP',
            'e_cost': np.nan,
            'target_cost': target_cost,
            'cost_risk_pct': np.nan,
            'e_duration': np.nan,
            'target_duration': round(target_duration, 1),
            'time_overrun_months': np.nan,
            'time_risk_pct': np.nan,
            'simulated_months': months_simulated,
        })
      else:
        e_cost = curr_cost
        e_duration = months_elapsed_init + months_simulated
        time_overrun = e_duration - target_duration

        cost_risk_pct = (
            ((e_cost - target_cost) / target_cost) * 100
            if pd.notnull(target_cost) and target_cost > 0
            else np.nan
        )
        time_risk_pct = (
            (time_overrun / target_duration) * 100
            if target_duration > 0
            else np.nan
        )

        results.append({
            'project_code': project_code,
            'project_key': project_key,
            'status': 'COMPLETED',
            'e_cost': round(e_cost, 2),
            'target_cost': target_cost,
            'cost_risk_pct': (
                round(cost_risk_pct, 2) if pd.notnull(cost_risk_pct) else np.nan
            ),
            'e_duration': round(e_duration, 1),
            'target_duration': round(target_duration, 1),
            'time_overrun_months': round(time_overrun, 1),
            'time_risk_pct': (
                round(time_risk_pct, 2) if pd.notnull(time_risk_pct) else np.nan
            ),
            'simulated_months': months_simulated,
        })

    df_forecast = pd.DataFrame(results)
    df_forecast.to_csv(results_time,sep='|')


def train_model(file,out_cost,out_time):

  # 1. Time model
  train_time(file,out_time)

  # 2. Cost model
  train_cost(file,out_cost)

