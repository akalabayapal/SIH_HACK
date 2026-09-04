# TEAM SIH PROJECT

## Main Goal

To make a prober web portal to show the risk of overflowing in  `Time` and `Cost/Budget` for the government projects.

Core Features we need to support:

1. A dashboard showing number of unique projects being tracked
2. The comparitive analysis of different sectors and there avg risk scores.(This compares which department is performing better and which bad)

3. A table listing all the projects and there risk score and projected finish date cost projected and time projected

4. Proper graphs using (`chart.js`) for visualising the data should be made

5. As we have the data we can internally use gemini-api to generate overall situation of country's projects and why some are lagging and how can we impove

6. History, model will/must be trained so that we can go back in time and see risks change

##  Data ingession techique

The data provided in the website is very cluttered in pdf
hence `pdf2csv.py` is used to convert the raw pdf to csv file

### Issue with different formats

The format before May 2025 had considerbly different format than after that. The commented lines can be uncommented from the code and commented to switch modes.


Then data is ingess by the `collector.py` it normalizes the data to a singular format.

Then that data will be used by `feature_extractor.py` to get/infer important features.

## Model Training

As there is shortage in data (Weakly time series problem) using massive models like RNN or LSTM will not give fruitfull results.Hence we took a different approach `feature_sxtractor.py` generates `master.csv` that is time unrolled completely flattened data set with X=features and Y=Projection of T+1 data

## Model Execution

We for each project run the model iteratively until the progress reaches close to 100% or it crosses a threshold.
Then we estimate the cost and time and calculate the risk factor

We propose 2 risk factors
1. `Absolute Risk Factor`

        = max(cost_risk,time_risk)
    
2. `Mean Risk Factor`

        = mean(cost_risk,time_risk)


## Driving Formulas

    cost_risk = (cost_projected - cost_target) / cost_target

    time_risk = (time_projected - time_target) / time_target


## Roles

Will be updates onces github profiles of team is recived

