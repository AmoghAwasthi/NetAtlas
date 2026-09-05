from app.schemas import DeviceOut

def test_device_schema():
    d=DeviceOut(
        id=1, ip_address="192.168.1.5", mac_address="AA:BB:CC:DD:EE:FF",
        hostname="test-pc", vendor=None, device_type=None, is_online=True,
        first_seen="2026-09-04T10:00:00Z", last_seen="2026-09-04T10:00:10Z"
    )
    assert d.ip_address=="192.168.1.5"
    assert d.is_online is True
