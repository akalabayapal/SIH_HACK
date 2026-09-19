# 🌿 KAB TAK (PAIMANA AI MONITORING AND NOTFY SYSTEM)

![Python](https://img.shields.io/badge/python-3.8%20to%203.13-blue)
![Database](https://img.shields.io/badge/database-MySQL-orange)
![Hackathon](https://img.shields.io/badge/Smart%20India%20Hackathon-PS--26103-green)

**KAB TAK** is an integrated project monitoring and risk prediction platform built for the **Smart India Hackathon (SIH)**, **Problem Statement PS-26103**.

It combines project monitoring, machine learning, and AI-powered analysis to identify potential **cost, schedule, and overall project risks** early, and to notify stakeholders before they become problems.

---

## ✨ Key Features

* 📊 Project monitoring and progress tracking
* 💰 Cost-risk prediction
* ⏱️ Schedule-risk prediction
* ⚠️ Overall project-risk assessment
* 🤖 Machine-learning based analysis
* ✨ Gemini AI-powered insights
* 📧 Email notifications
* 🗄️ MySQL database
* 🌐 Integrated frontend and backend
* 🌍 Multilingual support: Hindi, Bengali, and Urdu
* 🌙 Dark mode

---

## 🛠️ Prerequisites

| Requirement | Details |
| ----------- | ------- |
| **Python** | Version **3.8 to 3.13** (above 3.7) |
| **MySQL** | Installed and running |
| **Gemini API key** | Required for AI-powered insights |
| **Email/SMTP account** | Used for application emails |

Check your Python version:

```bash
python --version
```

> ⚠️ Python 3.7 and older is **not supported**.

> ⚠️ Python 3.13 and newer is **not supported**.

---

## 📥 Installation

```bash
git clone https://github.com/akalabayapal/SIH_HACK.git
cd SIH_HACK
pip install -r requirements.txt
```

---

## ⚙️ Configuration

Open `config.json` and fill in your MySQL, Gemini, and email credentials:

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

### Values you must set

| Key | Description |
| --- | ----------- |
| `host`, `port` | MySQL host and port (normally `localhost` / `3306`) |
| `user`, `password` | MySQL username and password |
| `database` | Database name (normally `hckdb`) |
| `gemini_key` | Your Gemini API key |
| `admin_user`, `admin_pwd` | Admin login for the application (change the default password) |
| `sender_email` | Email address the application sends from |
| `sender_password` | Email/SMTP password (for Gmail, an **App Password** may be required) |

The remaining keys (ports, data paths) work with their defaults. Backend and frontend ports can be changed via `port_backend` and `port_frontend`.

### Notes

* **Database:** you do **not** need to create the database or import `hckdb.sql` manually. The project scripts create and initialize the database and tables automatically. MySQL only needs to be running.
* **Machine learning:** keep `"is_trained": false` for the first run. The ML/data-processing pipeline runs automatically, so the **first startup may take longer**.

---

## ▶️ Running the Project

Make sure MySQL is running and `config.json` is configured, then:

```bash
python run.py
```

On Windows:

```bash
py run.py
```

`run.py` starts everything automatically: database setup, ML pipeline, backend, and frontend. You do not need to start any of them manually.

**Default addresses:** Backend on port `3000`, Frontend on port `8000`.

---

## 📁 Project Structure

```text
SIH_HACK/
├── BACKEND/            # Backend / API
├── FRONTEND/           # User interface
├── ML/                 # Machine-learning components
├── run.py              # Main entry point
├── pipeline.py         # ML / data pipeline
├── config.json         # Application configuration
├── config_loader.py    # Configuration loader
├── db_setup.py         # Automatic database initialization
├── hckdb.sql           # Database schema
├── requirements.txt    # Python dependencies
└── README.md
```

---

## 🔧 Troubleshooting

| Problem | What to check |
| ------- | ------------- |
| **MySQL connection error** | MySQL is running; `host`, `port`, `user`, and `password` are correct; the user has the required permissions |
| **Gemini API error** | `gemini_key` is present and valid |
| **Email error** | `sender_email` and `sender_password` are correct; your provider allows SMTP access; use an App Password if required |
| **Missing Python package** | Run `pip install -r requirements.txt`, then `python run.py` again |
| **Installation or import errors** | Confirm your Python version is between 3.8 and 3.13 (`python --version`) |
| **Port already in use** | Change `port_backend` or `port_frontend` in `config.json` |

---

## 🔐 Security

Never commit real credentials to GitHub, including MySQL passwords, Gemini API keys, email/SMTP passwords, and admin passwords. Keep `config.json` values as placeholders in the repository.

For production deployments, use environment variables or a secure secret-management system.

---

## 🏆 Smart India Hackathon

Developed for the **Smart India Hackathon (SIH)**, **Problem Statement PS-26103**, to provide an intelligent platform for project monitoring, risk prediction, and AI-assisted project analysis.