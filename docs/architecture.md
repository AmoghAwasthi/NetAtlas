# NetAtlas Live Architecture

```text
Browser
   |
WebSocket / REST
   |
FastAPI Backend
   |-------------------|
   |                   |
SQLAlchemy        Discovery Loop
   |                   |
Database            Scapy/ARP
                       |
                     LAN
```

## Database

`devices` stores identity/current state:
- IP
- MAC
- hostname
- vendor
- device type
- online state
- first seen
- last seen

`device_events` stores:
- DEVICE_JOINED
- DEVICE_LEFT
- DEVICE_RECONNECTED

## Recommended next tables

```text
network_nodes
network_links
interfaces
ip_addresses
```

Keep discovery separate from topology rendering so the same visualization can eventually accept both real devices and simulated devices.
