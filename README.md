# 🌿 PAIMANA_KT — Project Monitoring & Risk Prediction

**PAIMANA_KT** is an integrated project monitoring and risk prediction platform developed for the **Smart India Hackathon (SIH)**.

It combines project monitoring, machine learning, AI-powered analysis, and risk prediction to help identify potential **cost, schedule, and overall project risks**.

### Key Features

* 📊 Project monitoring and progress tracking
* 💰 Cost-risk prediction
* ⏱️ Schedule-risk prediction
* ⚠️ Overall project-risk assessment
* 🤖 Machine-learning based analysis
* ✨ Gemini AI-powered insights
* 📧 Email notifications
* 🗄️ MySQL database
* 🌐 Integrated frontend and backend

---

## 🛠️ Requirements

Install the following before running the project:

* **Python 3.10+**
* **MySQL** — must be installed and running
* A **Gemini API key**
* An **email/SMTP account** for application emails

Check Python:

```bash
python --version
```

---

## 📥 Installation

Clone the repository:

```bash
git clone https://github.com/akalabayapal/SIH_HACK.git
cd SIH_HACK
```

Install the Python dependencies:

```bash
pip install -r requirements.txt
```

---

## ⚙️ Configuration

Open:

```text
config.json
```

Configure your MySQL, Gemini, and email credentials.

Example:

```json
{
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "YOUR_MYSQL_PASSWORD",
    "database": "hckdb",

    "host_backend": "localhost",
    "port_backend": "3000",

    "host_frontend": "localhost",
    "port_frontend": "8000",

    "is_trained": false,

    "raw_pdf": "ML/raw",
    "raw_csv": "ML/csv/raw",
    "p_csv": "ML/csv/preprocessed",
    "master_csv": "ML/csv/master.csv",
    "cost_data": "ML/csv/final/model_cost.csv",
    "time_data": "ML/csv/final/model_time.csv",

    "gemini_key": "YOUR_GEMINI_API_KEY",

    "admin_user": "Admin",
    "admin_pwd": "CHANGE_THIS_PASSWORD",

    "sender_email": "YOUR_EMAIL_ADDRESS",
    "sender_password": "YOUR_EMAIL_PASSWORD"
}
```

### Required values

| Configuration     | Description                           |
| ----------------- | ------------------------------------- |
| `host`            | MySQL host                            |
| `port`            | MySQL port, normally `3306`           |
| `user`            | MySQL username                        |
| `password`        | MySQL password                        |
| `database`        | Database name, normally `hckdb`       |
| `gemini_key`      | Gemini API key                        |
| `sender_email`    | Email address used by the application |
| `sender_password` | Email/SMTP password or app password   |

> ⚠️ **Never commit real passwords, API keys, or other credentials to GitHub.**

### MySQL

MySQL must be installed and running before starting PAIMANA_KT.

**You do not need to manually create the database or import `hckdb.sql`.** The project's Python scripts automatically create and initialize the required database and tables.

### Gemini

Provide a valid Gemini API key:

```json
"gemini_key": "YOUR_GEMINI_API_KEY"
```

### Email

Provide the email account used by the application:

```json
"sender_email": "YOUR_EMAIL_ADDRESS",
"sender_password": "YOUR_EMAIL_PASSWORD"
```

For Gmail, an **App Password** may be required depending on your account's security settings.

---

## 🧠 Machine Learning

The default configuration is:

```json
"is_trained": false
```

This allows the application to perform the required ML/data-processing pipeline during the initial run.

> ⏳ The first startup may take longer while the required processing/training is completed.

---

## ▶️ Running PAIMANA_KT

Once MySQL is running and `config.json` is configured, simply run:

```bash
python run.py
```

On Windows:

```bash
py run.py
```

That's all.

**You do not need to manually start the frontend, backend, ML pipeline, or database setup scripts.**

`run.py` handles the required startup processes automatically.

---

## 📁 Project Structure

```text
PAIMANA_KT/
│
├── BACKEND/              # Backend/API
├── FRONTEND/             # User interface
├── ML/                   # Machine-learning components
├── run.py                # Main application entry point
├── pipeline.py           # ML/data pipeline
├── config.json           # Application configuration
├── config_loader.py      # Configuration loader
├── db_setup.py           # Automatic database initialization
├── hckdb.sql             # Database schema
├── requirements.txt      # Python dependencies
└── README.md
```

---

## 🔧 Troubleshooting

### MySQL connection error

Check that:

* MySQL is installed and running.
* `host` and `port` are correct.
* The username and password are correct.
* The MySQL user has the required permissions.

### Gemini API error

Verify:

```json
"gemini_key": "YOUR_GEMINI_API_KEY"
```

and make sure the API key is valid.

### Email error

Verify:

```json
"sender_email": "YOUR_EMAIL_ADDRESS",
"sender_password": "YOUR_EMAIL_PASSWORD"
```

Check that your email provider allows SMTP access and use an App Password if required.

### Missing Python package

Run:

```bash
pip install -r requirements.txt
```

Then:

```bash
python run.py
```

### Port already in use

The default ports are:

```text
Backend:  3000
Frontend: 8000
```

They can be changed in `config.json`.

---

## 🔐 Security

Do not commit sensitive information such as:

* MySQL passwords
* Gemini API keys
* Email passwords
* Admin passwords
* SMTP credentials

For production deployments, use environment variables or a secure secret-management system.

---

## 🏆 Smart India Hackathon

**PAIMANA_KT** was developed as part of the **Smart India Hackathon (SIH)** to provide an intelligent platform for project monitoring, risk prediction, and AI-assisted project analysis.

---

## 🚀 Quick Reference

```bash
git clone https://github.com/akalabayapal/SIH_HACK.git
cd SIH_HACK
pip install -r requirements.txt
```

Configure `config.json`, make sure MySQL is running, and then:

```bash
python run.py
```

> **Configure once → Start MySQL → Run `python run.py` → PAIMANA_KT starts.** 🚀
