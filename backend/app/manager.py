from datetime import datetime, timezone
from sqlalchemy import select
from .database import SessionLocal
from .discovery import arp_scan, get_local_subnet
from .models import Device, DeviceEvent

def utcnow():
    return datetime.now(timezone.utc)

def perform_scan():
    subnet = get_local_subnet()
    discovered = arp_scan(subnet)

    db = SessionLocal()
    try:
        existing = {d.ip_address: d for d in db.scalars(select(Device)).all()}
        seen_ips = set()

        for item in discovered:
            seen_ips.add(item.ip_address)
            device = existing.get(item.ip_address)

            if device is None:
                device = Device(
                    ip_address=item.ip_address,
                    mac_address=item.mac_address,
                    hostname=item.hostname,
                    is_online=True,
                )
                db.add(device)
                db.flush()
                db.add(DeviceEvent(device_id=device.id, event_type="DEVICE_JOINED"))
            else:
                was_offline = not device.is_online
                device.mac_address = item.mac_address or device.mac_address
                device.hostname = item.hostname or device.hostname
                device.is_online = True
                device.last_seen = utcnow()

                if was_offline:
                    db.add(DeviceEvent(
                        device_id=device.id,
                        event_type="DEVICE_RECONNECTED"
                    ))

        for device in existing.values():
            if device.ip_address not in seen_ips and device.is_online:
                device.is_online = False
                db.add(DeviceEvent(
                    device_id=device.id,
                    event_type="DEVICE_LEFT"
                ))

        db.commit()
        return subnet, db.scalars(select(Device).order_by(Device.ip_address)).all()
    finally:
        db.close()
