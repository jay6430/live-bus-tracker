import requests
import json
import csv
import time
from datetime import datetime
import pytz

# API URL
URL = "https://fms.locanix.net/TrackingTool/src/getPosition.ashx"

# Query params (IMPORTANT: update 't' if it expires)
PARAMS = {
    "t": "62938I5148639916835328",
    "format": "json"
}

# CSV file
CSV_FILE = "bus_tracking_data.csv"

# IST timezone
IST = pytz.timezone("Asia/Kolkata")


def get_clean_json(response_text):
    """
    Remove JSONP wrapper and return pure JSON
    """
    start = response_text.find("(") + 1
    end = response_text.rfind(")")
    json_str = response_text[start:end]
    return json.loads(json_str)


def fetch_and_store():
    try:
        response = requests.get(URL, params=PARAMS)
        data = get_clean_json(response.text)

        markers = data.get("markers", [])

        # Current IST timestamp
        timestamp_ist = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")

        rows = []
        for m in markers:
            row = [
                timestamp_ist,
                m.get("uid"),
                m.get("nume"),
                m.get("lat"),
                m.get("lng"),
                m.get("viteza"),
                m.get("directie"),
                m.get("ora")
            ]
            rows.append(row)

        # Write to CSV (append mode)
        with open(CSV_FILE, mode="a", newline="") as file:
            writer = csv.writer(file)

            # Write header if file is empty
            if file.tell() == 0:
                writer.writerow([
                    "timestamp_ist",
                    "uid",
                    "vehicle_no",
                    "lat",
                    "lng",
                    "speed",
                    "direction",
                    "server_time"
                ])

            writer.writerows(rows)

        print(f"[{timestamp_ist}] Stored {len(rows)} records")

    except Exception as e:
        print("Error:", e)


# Run continuously
if __name__ == "__main__":
    INTERVAL_SECONDS = 15  # adjust as needed

    while True:
        fetch_and_store()
        time.sleep(INTERVAL_SECONDS)