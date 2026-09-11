import os
from werkzeug.utils import secure_filename

UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MONTHS = {
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def is_valid_month(month) -> bool:
    """
    Returns True if month is a numeric month (1-12) or a valid month name
    (case-insensitive), False otherwise.
    """
    month_str = str(month).strip()

    if month_str.isdigit():
        return 1 <= int(month_str) <= 12

    return month_str.lower() in MONTHS

def upload(file, month, year, overwrite=False) -> str:
    """
    Saves an uploaded PDF as FlashReport_<month>_<year>.pdf.
    Returns the saved filename.
    Raises ValueError if inputs are invalid, the file is too large,
    or the file already exists (when overwrite=False).
    """
    if not allowed_file(file.filename):
        raise ValueError(f"only {ALLOWED_EXTENSIONS} files are allowed")

    if not is_valid_month(month):
        raise ValueError(f"Invalid month!")

    # Check actual size by seeking to the end of the stream
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)  # reset pointer so file.save() writes from the start

    if size > MAX_FILE_SIZE:
        raise ValueError(f"file exceeds max size of {MAX_FILE_SIZE // (1024 * 1024)} MB")

    month = secure_filename(str(month))
    year = secure_filename(str(year))

    filename = f"FlashReport_{month}_{year}.pdf"
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    if not overwrite and os.path.exists(filepath):
        raise ValueError(f"a report for {month}/{year} already exists")

    file.save(filepath)
    return filename