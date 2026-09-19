DROP DATABASE IF EXISTS hckdb;
CREATE DATABASE hckdb;
USE hckdb;

CREATE TABLE master (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code INT,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    state VARCHAR(64),
    date_start DATE,
    date_start_revised DATE,
    date_end DATE,
    date_end_revised DATE,
    cost_target DECIMAL(15, 2) NOT NULL,
    cost_target_revised DECIMAL(15, 2) NOT NULL,
    cost_spent DECIMAL(15, 2) NOT NULL,
    progress FLOAT NOT NULL,
    report_date DATE NOT NULL
);

CREATE TABLE projects (
    code INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    status_cost VARCHAR(8) NOT NULL,
    status_time VARCHAR(8) NOT NULL,
    start_date DATE DEFAULT NULL,
    start_date_revised DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL,
    end_date_revised DATE DEFAULT NULL,
    project_budget DECIMAL(15, 2) NOT NULL,
    project_budget_revised DECIMAL(15, 2) NOT NULL,
    cspend DECIMAL(15, 2) NOT NULL,
    time_risk FLOAT NOT NULL,
    cost_risk FLOAT NOT NULL,
    overall_risk FLOAT NOT NULL,
    progress FLOAT NOT NULL,
    PRIMARY KEY (code)
);

CREATE TABLE review (
    code INT NOT NULL PRIMARY KEY,
    upvotes INT NOT NULL DEFAULT 0,
    downvotes INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_review_projects FOREIGN KEY (code) REFERENCES projects(code) ON DELETE CASCADE
);

CREATE TABLE subs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL
);