import os
import smtplib
from email.message import EmailMessage
from config_loader import AuthObject

email_auth = AuthObject()

SENDER_EMAIL = email_auth.sender_email
SENDER_PASSWORD = email_auth.sender_password

def send_email(recipient: str, subject: str, html_body, text_fallback):
    # Construct the modern email message object
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = recipient

    msg.set_content(text_fallback)
    msg.add_alternative(html_body, subtype="html")

    try:
        # Establish a secure connection directly to Gmail via SSL on Port 465
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        print(f"🚀 Email successfully sent to {recipient}")
    except Exception as e:
        print(f"❌ Failed to send email. Error: {e}")

# Test the function
if __name__ == "__main__":
    TEST_RECEIVER = "4libaba40@gmail.com"
    fallback_text = "Welcome to our Hackathon Project! Please view this email in an HTML-compatible client."

    CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
    ABSOLUTE_TEMPLATE_PATH = os.path.join(CURRENT_DIR, "template.html")

    try:
        with open(ABSOLUTE_TEMPLATE_PATH, "r", encoding="utf-8") as file:
            raw_html = file.read()

        final_html = raw_html.format(user_name="KabTak")
        send_email(
            recipient=TEST_RECEIVER,
            subject="Hackathon Test Email 🔥",
            text_fallback=fallback_text,
            html_body=final_html   
        )

    except FileNotFoundError:
        print("❌ Error: Could not find the 'template.html' file. Ensure it is in the same directory.")


