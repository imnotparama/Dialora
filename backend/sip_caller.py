"""
sip_caller.py — Asterisk SIP outbound calling helper for Dialora.

Writes Asterisk .call files to trigger outbound SIP calls.
Requires Asterisk to be installed: sudo apt install asterisk

NOTE: All paths use /var/spool/asterisk/outgoing/ which is the standard
Asterisk call file drop directory. The AGI script (dialora_agent.agi) must
be placed in /var/lib/asterisk/agi-bin/ and made executable.
"""

import os
import subprocess
import time


CALL_SPOOL_DIR = "/var/spool/asterisk/outgoing"
AGI_SCRIPT_NAME = "dialora_agent.agi"


def initiate_call(phone_number: str, campaign_id: int) -> dict:
    """
    Writes an Asterisk .call file to trigger an outbound SIP call.
    Asterisk monitors the spool dir and picks up the file automatically.

    Args:
        phone_number: E.164 format e.g. +91XXXXXXXXXX
        campaign_id:  ID of the campaign (passed to AGI script as env var)

    Returns:
        dict with status and phone number
    """
    # Sanitize phone number for filename
    safe_phone = phone_number.replace("+", "").replace(" ", "").replace("-", "")
    timestamp = int(time.time())
    call_file = os.path.join(CALL_SPOOL_DIR, f"dialora_{safe_phone}_{timestamp}.call")

    content = f"""Channel: SIP/{phone_number}
MaxRetries: 1
RetryTime: 60
WaitTime: 30
Application: AGI
Data: {AGI_SCRIPT_NAME}
SetVar: CAMPAIGN_ID={campaign_id}
SetVar: BACKEND_URL=http://127.0.0.1:8000
"""

    try:
        # Write to a temp file first, then move — avoids Asterisk partial-read race
        tmp_file = call_file + ".tmp"
        with open(tmp_file, "w") as f:
            f.write(content)
        os.rename(tmp_file, call_file)
        print(f"[Asterisk] Call file created: {call_file}")
        return {"status": "dialing", "phone": phone_number, "campaign_id": campaign_id}
    except PermissionError:
        print(f"[Asterisk] Permission denied writing to {CALL_SPOOL_DIR}")
        return {"status": "error", "message": f"Cannot write to {CALL_SPOOL_DIR} — run backend as root or grant write access"}
    except Exception as e:
        print(f"[Asterisk] initiate_call error: {e}")
        return {"status": "error", "message": str(e)}


def get_asterisk_status() -> dict:
    """
    Checks whether the Asterisk service is currently running.

    Returns:
        {"running": True/False, "version": str | None}
    """
    try:
        result = subprocess.run(
            ["asterisk", "-rx", "core show version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return {"running": True, "version": result.stdout.strip().split("\n")[0]}
        return {"running": False, "version": None}
    except FileNotFoundError:
        return {"running": False, "version": None, "message": "Asterisk not installed"}
    except subprocess.TimeoutExpired:
        return {"running": False, "version": None, "message": "Asterisk check timed out"}
    except Exception as e:
        return {"running": False, "version": None, "message": str(e)}
