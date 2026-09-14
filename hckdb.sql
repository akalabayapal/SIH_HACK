DROP DATABASE IF EXISTS hckdb;
CREATE DATABASE IF NOT EXISTS hckdb;
USE hckdb;

CREATE TABLE IF NOT EXISTS master (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code INT,
    name VARCHAR(512) NOT NULL,
    department VARCHAR(512) NOT NULL,
    state VARCHAR(64),
    date_start VARCHAR(64),
    date_start_revised VARCHAR(64),
    date_end VARCHAR(64),
    date_end_revised VARCHAR(64),
    cost_target FLOAT NOT NULL,
    cost_target_revised FLOAT NOT NULL,
    cost_spent FLOAT NOT NULL,
    progress FLOAT NOT NULL,
    report_date VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    code INT NOT NULL,
    name VARCHAR(1024) NOT NULL,
    status_cost VARCHAR(8) NOT NULL,
    status_time VARCHAR(8) NOT NULL,
    start_date VARCHAR(32) DEFAULT NULL,
    start_date_revised VARCHAR(32) DEFAULT NULL,
    end_date VARCHAR(32) DEFAULT NULL,
    end_date_revised VARCHAR(32) DEFAULT NULL,
    project_budget FLOAT NOT NULL,
    project_budget_revised FLOAT NOT NULL,
    cspend FLOAT NOT NULL,
    time_risk FLOAT NOT NULL,
    cost_risk FLOAT NOT NULL,
    overall_risk FLOAT NOT NULL,
    progress FLOAT NOT NULL,
    PRIMARY KEY (code)
);

CREATE TABLE IF NOT EXISTS review (
    `code` INT NOT NULL,
    `upvotes` INT NOT NULL DEFAULT 0,
    `downvotes` INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `subs` (
    `id` INT NOT NULL,
    `email` VARCHAR(1024) NOT NULL
);

ALTER TABLE `subs`
    ADD PRIMARY KEY (`id`);

ALTER TABLE `subs`
    MODIFY `id` INT NOT NULL AUTO_INCREMENT;

COMMIT;

TRUNCATE TABLE master;
TRUNCATE TABLE projects;
TRUNCATE TABLE review;