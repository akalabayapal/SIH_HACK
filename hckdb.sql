CREATE DATABASE IF NOT EXISTS hckdb;
USE hckdb;

CREATE TABLE IF NOT EXISTS master (
    id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code int,
    name varchar(512) NOT NULL,
    department varchar(512) NOT NULL,
    state varchar(64),
    date_start varchar(64),
    date_start_revised varchar(64),
    date_end varchar(64),
    date_end_revised varchar(64),
    cost_target float NOT NULL,
    cost_target_revised float NOT NULL,
    cost_spent float NOT NULL,
    progress float NOT NULL,
    report_date varchar(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    code int(11) NOT NULL,
    name varchar(1024) NOT NULL,
    status_cost varchar(8) NOT NULL,
    status_time varchar(8) NOT NULL,
    start_date varchar(32) DEFAULT NULL,
    start_date_revised varchar(32) DEFAULT NULL,
    end_date varchar(32) DEFAULT NULL,
    end_date_revised varchar(32) DEFAULT NULL,
    project_budget float NOT NULL,
    project_budget_revised float NOT NULL,
    cspend float NOT NULL,
    time_risk float NOT NULL,
    cost_risk float NOT NULL,
    overall_risk float NOT NULL,
    progress float NOT NULL,
    PRIMARY KEY (code)
);

CREATE TABLE IF NOT EXISTS review (
  `code` int(11) NOT NULL,
  `upvotes` int(11) NOT NULL DEFAULT 0,
  `downvotes` int(11) NOT NULL DEFAULT 0
);


TRUNCATE TABLE master;
TRUNCATE TABLE projects;
TRUNCATE TABLE review;