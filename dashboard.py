import streamlit as st
import pandas as pd
import plotly.express as px
from streamlit_autorefresh import st_autorefresh

# ---------------- CONFIG ----------------
CSV_FILE = "bus_tracking_data.csv"

st.set_page_config(layout="wide")

# ✅ NON-BLOCKING AUTO REFRESH (VERY IMPORTANT)
st_autorefresh(interval=15000, key="datarefresh")  # 15 sec

# ---------------- LOAD DATA ----------------
@st.cache_data(ttl=10)
def load_data():
    df = pd.read_csv(CSV_FILE)

    # Clean data
    df["timestamp_ist"] = pd.to_datetime(df["timestamp_ist"], errors="coerce")
    df["vehicle_no"] = df["vehicle_no"].astype(str).str.strip()

    return df

df = load_data()

# ---------------- TABS ----------------
tab1, tab2 = st.tabs(["📊 Live Dashboard", "🧭 Route Tracker"])


# ================================
# 📊 TAB 1 — LIVE DASHBOARD
# ================================
with tab1:
    st.title("🚌 Live Bus Tracking Dashboard")

    if df.empty:
        st.warning("No data available yet...")
    else:
        latest_time = df["timestamp_ist"].max()
        latest_df = df[df["timestamp_ist"] == latest_time]

        # Metrics
        col1, col2, col3 = st.columns(3)

        total_buses = latest_df["uid"].nunique()
        moving = (latest_df["speed"] > 1).sum()
        idle = (latest_df["speed"] <= 1).sum()
        avg_speed = latest_df["speed"].mean()

        col1.metric("🚌 Total Buses", total_buses)
        col2.metric("🚀 Moving", moving)
        col3.metric("🛑 Idle", idle)

        st.metric("⚡ Avg Speed", f"{avg_speed:.2f}")

        # Map
        st.subheader("📍 Live Bus Locations")
        st.map(latest_df.rename(columns={"lat": "latitude", "lng": "longitude"}))

        # Speed Distribution
        st.subheader("📊 Speed Distribution")
        fig = px.histogram(latest_df, x="speed", nbins=20)
        st.plotly_chart(fig, use_container_width=True)

        # Time Series
        st.subheader("📈 Movement Over Time")
        time_df = df.groupby("timestamp_ist")["speed"].mean().reset_index()
        fig2 = px.line(time_df, x="timestamp_ist", y="speed")
        st.plotly_chart(fig2, use_container_width=True)


# ================================
# 🧭 TAB 2 — ROUTE TRACKER
# ================================
with tab2:
    st.title("🧭 Bus Route Tracker")

    if df.empty:
        st.warning("No data available yet...")
    else:
        # Dropdown for bus selection
        bus_list = sorted(df["vehicle_no"].dropna().unique())

        if len(bus_list) == 0:
            st.warning("No bus data found")
        else:
            selected_bus = st.selectbox("Select Bus", bus_list)
            st.write(f"Selected Bus: {selected_bus}")

            # Time filter
            time_option = st.selectbox(
                "Select Time Range",
                ["Last 30 minutes", "Last 1 hour", "All Data"]
            )

            now = df["timestamp_ist"].max()

            if time_option == "Last 30 minutes":
                filtered_df = df[df["timestamp_ist"] >= now - pd.Timedelta(minutes=30)]
            elif time_option == "Last 1 hour":
                filtered_df = df[df["timestamp_ist"] >= now - pd.Timedelta(hours=1)]
            else:
                filtered_df = df

            # Filter for selected bus
            bus_df = filtered_df[
                filtered_df["vehicle_no"] == selected_bus
            ].sort_values("timestamp_ist")

            st.write(f"Rows found: {len(bus_df)}")

            if bus_df.empty:
                st.warning("No data available for selected bus/time range")
            else:
                st.subheader(f"Route for {selected_bus}")

                # 📍 Map with points + path
                fig = px.scatter_mapbox(
                    bus_df,
                    lat="lat",
                    lon="lng",
                    color="speed",
                    hover_data=["timestamp_ist"],
                    zoom=12,
                    height=600
                )

                # Add route line
                fig.add_scattermapbox(
                    lat=bus_df["lat"],
                    lon=bus_df["lng"],
                    mode="lines",
                    line=dict(width=3),
                    name="Route"
                )

                fig.update_layout(mapbox_style="open-street-map")
                st.plotly_chart(fig, use_container_width=True)

                # Start / End markers
                start = bus_df.iloc[0]
                end = bus_df.iloc[-1]

                st.success(
                    f"Start: {start['timestamp_ist']} → End: {end['timestamp_ist']}"
                )