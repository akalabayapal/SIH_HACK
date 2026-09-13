import os
import smtplib
from email.message import EmailMessage
from config_loader import AuthObject

email_auth = AuthObject()

SENDER_EMAIL = email_auth.sender_email
SENDER_PASSWORD = email_auth.sender_password


# ---------------------------------------------------------------------------
# Task 1: Generate Clean & Modern HTML Email Template from JSON/List Schema
# ---------------------------------------------------------------------------
def generate_html_template(sections_data: list) -> str:
    """
    Accepts a list of dictionaries with section data in either format:
    Format A: [{"heading_1": "content 1"}, {"heading_2": "content 2"}]
    Format B: [{"heading": "Title", "content": "Body text..."}, ...]

    Returns a responsive, modern HTML template string.
    """
    sections_html = ""

    for item in sections_data:
        if not isinstance(item, dict):
            continue

        # Format B check: standard keys {'heading': ..., 'content': ...}
        if "heading" in item and "content" in item and len(item) == 2:
            heading = item["heading"]
            content = item["content"]
        else:
            # Format A check: key is heading, value is content
            for heading, content in item.items():
                sections_html += f"""
                <div style="background-color: #ffffff; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #1d5fa8; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <h2 style="color: #0b2e59; font-size: 18px; margin-top: 0; margin-bottom: 10px; font-weight: 700;">{heading}</h2>
                    <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin: 0;">{content}</p>
                </div>
                """
            continue

        sections_html += f"""
        <div style="background-color: #ffffff; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #1d5fa8; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <h2 style="color: #0b2e59; font-size: 18px; margin-top: 0; margin-bottom: 10px; font-weight: 700;">{heading}</h2>
            <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin: 0;">{content}</p>
        </div>
        """

    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kab Tak Newsletter</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f6f9; padding: 40px 10px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0b2e59; padding: 30px; text-align: center; border-bottom: 4px solid #ff9933;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.5px;">Kab Tak</h1>
                            <p style="color: #cbd5e1; margin: 5px 0 0 0; font-size: 13px;">Project Monitoring & Early Warning System</p>
                        </td>
                    </tr>
                    <!-- Content Body -->
                    <tr>
                        <td style="padding: 30px 25px; background-color: #f8fafc;">
                            {sections_html}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #0b2e59; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
                            <p style="margin: 0 0 5px 0;">Ministry of Statistics and Programme Implementation, Govt of India</p>
                            <p style="margin: 0; opacity: 0.8;">You received this because you subscribed to Kab Tak project updates.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""
    return html_template


# ---------------------------------------------------------------------------
# Task 2: Core Functions `send` and `broadcast`
# ---------------------------------------------------------------------------
def send_email(recipient: str, subject: str, html_body: str, text_fallback: str):
    """Base helper function to send single SMTP email."""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = recipient

    msg.set_content(text_fallback)
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        print(f"🚀 Email successfully sent to {recipient}")
        return True
    except Exception as e:
        print(f"❌ Failed to send email to {recipient}. Error: {e}")
        return False


def send(recipient: str, subject: str, content_json: list, text_fallback: str = "Please view this email in an HTML-compatible client."):
    """
    Generates dynamic HTML from JSON content schema and sends to a single recipient.
    """
    html_body = generate_html_template(content_json)
    return send_email(
        recipient=recipient,
        subject=subject,
        html_body=html_body,
        text_fallback=text_fallback
    )


def broadcast(subject: str, content_json: list, cursor, text_fallback: str = "Please view this email in an HTML-compatible client."):
    """
    Looks up all recipient emails from the `subs` table and sends a single BCC email broadcast.
    
    :param subject: Email subject line
    :param content_json: List of sections JSON schema
    :param cursor: Active database cursor (e.g. self.cursor)
    """
    try:
        cursor.execute("SELECT email FROM subs")
        rows = cursor.fetchall()
        
        # Extract email list
        recipients = [row[0] if isinstance(row, (list, tuple)) else row['email'] for row in rows if row]
        
        if not recipients:
            print("⚠️ No subscribers found in database table 'subs'. Broadcast skipped.")
            return False

        html_body = generate_html_template(content_json)

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = SENDER_EMAIL
        msg["To"] = SENDER_EMAIL  # Primary To address set to sender for privacy
        msg["Bcc"] = ", ".join(recipients)

        msg.set_content(text_fallback)
        msg.add_alternative(html_body, subtype="html")

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)

        print(f"📢 Broadcast email sent to {len(recipients)} subscribers via BCC.")
        return True

    except Exception as e:
        print(f"❌ Broadcast failed. Error: {e}")
        return False


# ---------------------------------------------------------------------------
# Example Usage & Testing
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    test_content = [
        {"Monthly Overview": "In March 2026, 85% of infrastructure projects met expected milestones."},
        {"Critical Risk Alert": "NIT Rourkela Hostel expansion project requires budget reallocation due to procurement delays."}
    ]

    # Test single send
    send(
        recipient="kallol.lipika2006@gmail.com",
        subject="Kab Tak Project Update - March 2026",
        content_json=test_content
    )