from datetime import datetime
from pydantic import BaseModel, ConfigDict

class DeviceOut(BaseModel):
    id: int
    ip_address: str
    mac_address: str | None
    hostname: str | None
    vendor: str | None
    device_type: str | None
    is_online: bool
    first_seen: datetime
    last_seen: datetime
    model_config = ConfigDict(from_attributes=True)

class ScanResult(BaseModel):
    subnet: str
    devices_found: int
    devices: list[DeviceOut]
