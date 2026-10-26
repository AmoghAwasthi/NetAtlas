from fastapi import APIRouter, HTTPException
from app.pg_database import get_pg_connection

router = APIRouter(prefix="/api/simulation", tags=["Simulation"])
SITE_NAME = "NetAtlas Simulation Office"


def fetch_all(sql, params=()):
    with get_pg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def site_filter(alias="s"):
    return f"{alias}.site_name = %s"


@router.get("/status")
def simulation_status():
    try:
        rows = fetch_all("""
            SELECT COUNT(*) AS total_devices,
                   COUNT(*) FILTER (WHERE d.status = 'UP') AS online_devices,
                   COUNT(*) FILTER (WHERE d.status = 'DOWN') AS offline_devices
            FROM device d
            JOIN network n ON n.network_id = d.network_id
            JOIN site s ON s.site_id = n.site_id
            WHERE s.site_name = %s;
        """, (SITE_NAME,))
        result = rows[0]
        return {"mode": "SIMULATION", "database": "connected",
                "total_devices": result["total_devices"],
                "online_devices": result["online_devices"],
                "offline_devices": result["offline_devices"]}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Simulation database error: {exc}")


@router.get("/devices")
def simulation_devices():
    try:
        devices = fetch_all("""
            SELECT d.device_id, d.hostname, d.device_type, d.vendor,
                   d.management_ip, d.status, d.first_seen, d.last_seen
            FROM device d
            JOIN network n ON n.network_id = d.network_id
            JOIN site s ON s.site_id = n.site_id
            WHERE s.site_name = %s
            ORDER BY d.device_id;
        """, (SITE_NAME,))
        return {"mode": "SIMULATION", "devices": devices}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load simulated devices: {exc}")


@router.get("/metrics")
def simulation_metrics():
    try:
        metrics = fetch_all("""
            SELECT d.hostname, m.metric_name, m.metric_value, m.unit, m.recorded_at
            FROM metric m
            JOIN device d ON d.device_id = m.device_id
            JOIN network n ON n.network_id = d.network_id
            JOIN site s ON s.site_id = n.site_id
            WHERE s.site_name = %s
            ORDER BY m.recorded_at DESC, d.hostname
            LIMIT 100;
        """, (SITE_NAME,))
        return {"mode": "SIMULATION", "metrics": metrics}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load simulated metrics: {exc}")


@router.get("/topology")
def simulation_topology():
    try:
        links = fetch_all("""
            SELECT tl.link_id, tl.link_type, tl.status AS link_status,
                   src.device_id AS source_device_id, src.hostname AS source_hostname,
                   src.device_type AS source_type, src.management_ip AS source_ip,
                   dst.device_id AS destination_device_id, dst.hostname AS destination_hostname,
                   dst.device_type AS destination_type, dst.management_ip AS destination_ip
            FROM topology_link tl
            JOIN interface si ON si.interface_id = tl.source_interface_id
            JOIN device src ON src.device_id = si.device_id
            JOIN network sn ON sn.network_id = src.network_id
            JOIN site ss ON ss.site_id = sn.site_id
            JOIN interface di ON di.interface_id = tl.destination_interface_id
            JOIN device dst ON dst.device_id = di.device_id
            JOIN network dn ON dn.network_id = dst.network_id
            JOIN site ds ON ds.site_id = dn.site_id
            WHERE ss.site_name = %s AND ds.site_name = %s
            ORDER BY tl.link_id;
        """, (SITE_NAME, SITE_NAME))
        return {"mode": "SIMULATION", "links": links}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load simulated topology: {exc}")


@router.get("/scans")
def simulation_scans():
    try:
        scans = fetch_all("""
            SELECT sc.scan_id, sc.scan_type, sc.mode, sc.started_at,
                   sc.completed_at, sc.status, n.network_name
            FROM scan sc
            JOIN network n ON n.network_id = sc.network_id
            JOIN site s ON s.site_id = n.site_id
            WHERE s.site_name = %s
            ORDER BY sc.started_at DESC, sc.scan_id DESC
            LIMIT 50;
        """, (SITE_NAME,))
        return {"mode": "SIMULATION", "scans": scans}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load scan history: {exc}")


@router.get("/events")
def simulation_events():
    try:
        events = fetch_all("""
            SELECT e.event_id, d.hostname, e.event_type, e.severity,
                   e.message, e.detected_at, e.resolved_at
            FROM network_event e
            JOIN network n ON n.network_id = e.network_id
            JOIN site s ON s.site_id = n.site_id
            LEFT JOIN device d ON d.device_id = e.device_id
            WHERE s.site_name = %s
            ORDER BY e.detected_at DESC, e.event_id DESC
            LIMIT 100;
        """, (SITE_NAME,))
        return {"mode": "SIMULATION", "events": events}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load network events: {exc}")


@router.get("/alerts")
def simulation_alerts():
    try:
        alerts = fetch_all("""
            SELECT a.alert_id, d.hostname, a.alert_type, a.severity,
                   a.status, a.created_at, a.resolved_at, e.message
            FROM alert a
            LEFT JOIN device d ON d.device_id = a.device_id
            LEFT JOIN network_event e ON e.event_id = a.event_id
            WHERE (d.device_id IS NULL OR EXISTS (
                SELECT 1 FROM network n
                JOIN site s ON s.site_id = n.site_id
                WHERE n.network_id = d.network_id AND s.site_name = %s
            ))
            ORDER BY a.created_at DESC, a.alert_id DESC
            LIMIT 100;
        """, (SITE_NAME,))
        return {"mode": "SIMULATION", "alerts": alerts}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load alerts: {exc}")


@router.get("/services")
def simulation_services():
    try:
        services = fetch_all("""
            SELECT d.hostname, ds.port, ds.state, ds.last_seen,
                   sv.service_name, sv.protocol, sv.default_port
            FROM device_service ds
            JOIN device d ON d.device_id = ds.device_id
            JOIN service sv ON sv.service_id = ds.service_id
            JOIN network n ON n.network_id = d.network_id
            JOIN site s ON s.site_id = n.site_id
            WHERE s.site_name = %s
            ORDER BY d.hostname, ds.port, sv.service_name;
        """, (SITE_NAME,))
        return {"mode": "SIMULATION", "services": services}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load services: {exc}")
