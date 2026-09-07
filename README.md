# PAIMANA — Project Monitoring & Risk Prediction

## 📁 Project Structure

```text
PROJECT/
├── ML/
│   ├── models/
│   ├── training/
│   └── preprocessing/
│
├── BACKEND/
│   └── app.py
│
├── FRONTEND/
│   └── index.html
│
└── README.md
```

---

# 🌿 Git Workflow

This project uses separate branches for the three major development areas:

| Branch     | Folder         | Responsibility                                       |
| ---------- | -------------- | ---------------------------------------------------- |
| `ml`       | `ML/`          | Machine Learning, preprocessing, training and models |
| `backend`  | `BACKEND/`     | Flask/API/backend development                        |
| `frontend` | `FRONTEND/`    | UI, HTML, CSS and JavaScript                         |
| `main`     | Entire project | Integrated and tested version                        |

### Branch Structure

```text
                    ┌── ml ───────── ML
                    │
main ───────────────┼── backend ───── Backend
                    │
                    └── frontend ──── Frontend
                             
                              ↓
                       Review + Testing
                              ↓
                            main
```

---

# 🚀 First-Time Setup

Clone the repository:

```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_NAME>
```

Switch to your assigned branch.

### ML

```bash
git checkout ml
```

### Backend

```bash
git checkout backend
```

### Frontend

```bash
git checkout frontend
```

Check your current branch:

```bash
git branch
```

The branch marked with `*` is your current branch.

---

# 💻 Development Workflow

Work on **your assigned branch**.

For example, the backend developer works primarily inside:

```text
BACKEND/
```

After making a logical set of changes:

```bash
git status
git add .
git commit -m "Describe your changes"
git push origin backend
```

Replace `backend` with `ml` or `frontend` when appropriate.

---

# 🧪 Testing the Complete System

`main` represents the latest integrated version of the project.

To test the complete system:

```bash
git checkout main
git pull origin main
```

Run the project and test the integration.

After testing, return to your development branch:

```bash
git checkout backend
```

Replace `backend` with your assigned branch.

> You do **not** need to continuously pull `main` into your development branch. Update your branch from `main` only when necessary.

---

# 🔀 Merging into `main`

Only the repository owner/integration manager should update the global `main` branch.

When your work is ready:

1. Commit your changes.
2. Push your branch to GitHub.
3. Inform the repository owner.
4. Your changes will be reviewed.
5. The changes will be tested with the complete system.
6. If everything works, they will be merged into `main`.

```text
Your Branch
     │
     │ commit + push
     ▼
  GitHub
     │
     │ review + integration testing
     ▼
   main
```

### 🚫 Do not push directly to `main`

Do **not** use:

```bash
git push origin main
```

Use your assigned branch instead:

```bash
git push origin backend
```

---

# 📝 Commit Guidelines

Use meaningful commit messages.

### ❌ Avoid

```text
update
changes
final
test
stuff
```

### ✅ Prefer

```text
Add project risk prediction model
Fix data preprocessing pipeline
Implement project API
Add dashboard layout
Connect frontend to backend API
```

Keep each commit focused on a logical change.

---

# ⚡ Quick Reference

```bash
# Clone repository
git clone <REPOSITORY_URL>

# Enter repository
cd <REPOSITORY_NAME>

# Switch to your branch
git checkout <ml/backend/frontend>

# Check current branch
git branch

# Check changes
git status

# Commit work
git add .
git commit -m "Describe your changes"

# Push your branch
git push origin <ml/backend/frontend>

# Get latest integrated project
git checkout main
git pull origin main

# Return to your development branch
git checkout <ml/backend/frontend>
```

---

## 🏆 Golden Rule

**Develop on your branch → Commit → Push your branch → Review & test → Merge into `main`.**

`main` should always represent the **integrated and tested version** of the project.
