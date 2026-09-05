# NetAtlas — Live Network Discovery Starter

Starter architecture for adding real-time LAN discovery to NetAtlas.

Stack:
- FastAPI backend
- Scapy for ARP discovery
- SQLAlchemy ORM
- SQLite by default
- WebSocket live updates
- Vanilla HTML/CSS/JS frontend

## Run

Windows: open PowerShell as Administrator.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

Open http://127.0.0.1:8000

API docs: http://127.0.0.1:8000/docs

The scanner runs every 10 seconds by default. Change SCAN_INTERVAL_SECONDS in `.env`.

Only scan networks you own or are authorized to administer.

## What is implemented

1. Detect local /24 subnet
2. ARP LAN discovery
3. IP + MAC + hostname collection
4. Device persistence
5. Online/offline tracking
6. First-seen / last-seen timestamps
7. Join/leave/reconnect events
8. WebSocket updates
9. Live device table
10. Manual Scan Now endpoint

Next:
- topology graph
- router/gateway identification
- latency and packet loss
- device/vendor classification
- historical analytics
- integration with NetAtlas simulation mode
